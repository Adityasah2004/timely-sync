import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, Modal, TouchableOpacity, TouchableWithoutFeedback,
  TextInput, ScrollView, StyleSheet, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform, Keyboard, UIManager, findNodeHandle,
  type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../lib/tokens';
import { useStore, toggleTodoItem } from '../lib/store';
import { supabase } from '../lib/supabase';
import { writeActivity } from '../lib/store';
import { scheduleNotif, cancelNotif, secondsUntil } from '../lib/notifications';
import { USER_LIST } from '../data/seed';
import * as SecureStore from 'expo-secure-store';
import { deriveKey, encryptText } from '../lib/crypto';
import type { CalEvent, UserId } from '../lib/types';

const REMINDER_NOTIF_KEY = (eventId: string) => `reminder_notif_${eventId}`;

const REMINDER_OPTIONS = [
  { label: 'None',         value: null },
  { label: 'At time',      value: 0    },
  { label: '5 min before', value: 5    },
  { label: '15 min',       value: 15   },
  { label: '30 min',       value: 30   },
  { label: '1 hour',       value: 60   },
  { label: '1 day',        value: 1440 },
] as const;

export function parseMarkdown(text: string, baseStyle: any = {}): React.ReactNode[] {
  if (!text) return [];

  const base = Array.isArray(baseStyle) ? baseStyle : [baseStyle];
  const baseColor = (Array.isArray(baseStyle) ? baseStyle[0] : baseStyle)?.color ?? colors.fg2;
  const baseFontSize = (Array.isArray(baseStyle) ? baseStyle[0] : baseStyle)?.fontSize ?? 14;

  // ── Inline token parser ─────────────────────────────────────
  // Handles: **bold**, *italic*, ~~strike~~, `code`, _italic_, ***bold-italic***
  function parseInline(str: string, extraStyle: any[] = [], keyPrefix: string = ''): React.ReactNode[] {
    const tokenRegex = /(\*\*\*.*?\*\*\*|\*\*.*?\*\*|~~.*?~~|\*.*?\*|_.*?_|`.*?`)/g;
    const parts = str.split(tokenRegex);
    return parts.map((part, i) => {
      const key = `${keyPrefix}-i${i}`;
      if (part.startsWith('***') && part.endsWith('***')) {
        return <Text key={key} style={[...base, ...extraStyle, { fontWeight: '900', fontStyle: 'italic' }]}>{part.slice(3, -3)}</Text>;
      }
      if (part.startsWith('**') && part.endsWith('**')) {
        return <Text key={key} style={[...base, ...extraStyle, { fontWeight: '800' }]}>{part.slice(2, -2)}</Text>;
      }
      if (part.startsWith('~~') && part.endsWith('~~')) {
        return <Text key={key} style={[...base, ...extraStyle, { textDecorationLine: 'line-through', opacity: 0.6 }]}>{part.slice(2, -2)}</Text>;
      }
      if ((part.startsWith('*') && part.endsWith('*') && part.length > 2) ||
          (part.startsWith('_') && part.endsWith('_') && part.length > 2)) {
        return <Text key={key} style={[...base, ...extraStyle, { fontStyle: 'italic' }]}>{part.slice(1, -1)}</Text>;
      }
      if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
        return (
          <Text key={key} style={[...base, ...extraStyle, {
            fontFamily: 'Courier', fontSize: baseFontSize - 1,
            backgroundColor: 'rgba(0,0,0,0.07)', paddingHorizontal: 4, borderRadius: 4,
          }]}>{part.slice(1, -1)}</Text>
        );
      }
      return <Text key={key} style={[...base, ...extraStyle]}>{part}</Text>;
    });
  }

  // ── Block parser ────────────────────────────────────────────
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let blockIdx = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    const key = `b${blockIdx++}`;

    // ── Fenced code block (``` or ~~~)
    if (/^(`{3,}|~{3,})/.test(trimmed)) {
      const fence = trimmed.match(/^(`{3,}|~{3,})/)![1];
      const lang = trimmed.slice(fence.length).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence)) {
        codeLines.push(lines[i]);
        i++;
      }
      nodes.push(
        <View key={key} style={{ backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: 8, padding: 12, marginVertical: 8, borderLeftWidth: 3, borderLeftColor: 'rgba(0,0,0,0.15)' }}>
          {lang ? <Text style={{ fontFamily: 'Courier', fontSize: 9, color: baseColor, opacity: 0.5, marginBottom: 4, letterSpacing: 0.5 }}>{lang.toUpperCase()}</Text> : null}
          <Text style={{ fontFamily: 'Courier', fontSize: baseFontSize - 1.5, color: baseColor, lineHeight: 20 }}>
            {codeLines.join('\n')}
          </Text>
        </View>
      );
      i++;
      continue;
    }

    // ── Horizontal rule (--- / *** / ___ with optional spaces)
    if (/^(\s*[-*_]){3,}\s*$/.test(trimmed) && trimmed.replace(/[\s\-*_]/g, '').length === 0) {
      nodes.push(
        <View key={key} style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.12)', marginVertical: 14 }} />
      );
      i++;
      continue;
    }

    // ── Headings (h1–h6)
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = headingMatch[2];
      const sizeMap: Record<number, number> = { 1: 24, 2: 20, 3: 17, 4: 15, 5: 13, 6: 12 };
      const weightMap: Record<number, string> = { 1: '900', 2: '900', 3: '800', 4: '800', 5: '700', 6: '700' };
      const marginMap: Record<number, number> = { 1: 12, 2: 10, 3: 8, 4: 6, 5: 5, 6: 4 };
      const opacityMap: Record<number, number> = { 1: 1, 2: 1, 3: 0.95, 4: 0.88, 5: 0.8, 6: 0.7 };
      nodes.push(
        <Text key={key} style={[...base, {
          fontSize: sizeMap[level],
          fontWeight: weightMap[level] as any,
          marginTop: marginMap[level] + 2,
          marginBottom: marginMap[level] - 2,
          opacity: opacityMap[level],
          letterSpacing: level <= 2 ? 0.3 : 0,
        }]}>
          {parseInline(content, [], key)}
        </Text>
      );
      i++;
      continue;
    }

    // ── Blockquote (> text)
    if (trimmed.startsWith('> ') || trimmed === '>') {
      const quoteLines: string[] = [];
      while (i < lines.length && (lines[i].trim().startsWith('>') || lines[i].trim() === '')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      nodes.push(
        <View key={key} style={{ borderLeftWidth: 3, borderLeftColor: 'rgba(0,0,0,0.2)', paddingLeft: 12, marginVertical: 6, opacity: 0.8 }}>
          <Text style={[...base, { fontStyle: 'italic' }]}>
            {parseInline(quoteLines.join('\n'), [], key)}
          </Text>
        </View>
      );
      continue;
    }

    // ── Unordered list item (-, *, +, •)
    if (/^[-*+•]\s+/.test(trimmed)) {
      const content = trimmed.replace(/^[-*+•]\s+/, '');
      nodes.push(
        <View key={key} style={{ flexDirection: 'row', marginVertical: 2, paddingLeft: 8 }}>
          <Text style={[...base, { marginRight: 8, lineHeight: (base[0]?.lineHeight ?? 22) }]}>{'•'}</Text>
          <Text style={[...base, { flex: 1 }]}>{parseInline(content, [], key)}</Text>
        </View>
      );
      i++;
      continue;
    }

    // ── Ordered list item (1. 2. etc.)
    const olMatch = trimmed.match(/^(\d+)[.)]\s+(.*)/);
    if (olMatch) {
      const num = olMatch[1];
      const content = olMatch[2];
      nodes.push(
        <View key={key} style={{ flexDirection: 'row', marginVertical: 2, paddingLeft: 8 }}>
          <Text style={[...base, { marginRight: 8, minWidth: 20, lineHeight: (base[0]?.lineHeight ?? 22) }]}>{num}.</Text>
          <Text style={[...base, { flex: 1 }]}>{parseInline(content, [], key)}</Text>
        </View>
      );
      i++;
      continue;
    }

    // ── Blank line → small spacer
    if (trimmed === '') {
      nodes.push(<Text key={key}>{'\n'}</Text>);
      i++;
      continue;
    }

    // ── Regular paragraph line with inline parsing
    nodes.push(
      <Text key={key} style={[...base, { marginBottom: 1 }]}>
        {parseInline(trimmed, [], key)}
        {'\n'}
      </Text>
    );
    i++;
  }

  return nodes;
}


function useName(id: string, profiles: import('../lib/store').ProfileMap): string {
  if (id === 'B') return 'Both';
  return profiles[id as import('../lib/types').UserId]?.displayName ?? 'N/A';
}
import { UserChip, AppSwitch, Card, SecLabel, styles as S } from './Primitives';
import { Icon } from './Icon';

// ─── Sheet shell ────────────────────────────────────────────
function SheetShell({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  const scrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  const keyboardTopRef = useRef(0);
  const [keyboardPadding, setKeyboardPadding] = useState(0);

  const ensureFocusedInputVisible = useCallback((keyboardScreenY?: number) => {
    const keyboardTop = keyboardScreenY ?? keyboardTopRef.current;
    if (Platform.OS !== 'android' || !keyboardTop) return;
    const focusedInput = TextInput.State.currentlyFocusedInput?.();
    const node = focusedInput ? findNodeHandle(focusedInput as any) : null;
    if (!node) return;

    UIManager.measureInWindow(node, (_x, y, _width, height) => {
      const focusedBottom = y + height;
      const gap = 24;
      const overlap = focusedBottom - (keyboardTop - gap);
      if (overlap > 0) {
        scrollRef.current?.scrollTo({
          y: scrollYRef.current + overlap,
          animated: true,
        });
      }
    });
  }, []);

  useEffect(() => {
    if (!visible || Platform.OS !== 'android') {
      setKeyboardPadding(0);
      return;
    }

    const showSub = Keyboard.addListener('keyboardDidShow', event => {
      keyboardTopRef.current = event.endCoordinates.screenY;
      setKeyboardPadding(event.endCoordinates.height);
      setTimeout(() => ensureFocusedInputVisible(event.endCoordinates.screenY), 60);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      keyboardTopRef.current = 0;
      setKeyboardPadding(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [ensureFocusedInputVisible, visible]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollYRef.current = event.nativeEvent.contentOffset.y;
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={sh.backdrop}>
          <TouchableWithoutFeedback>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={sh.sheet}
            >
              <View style={sh.grab} />
              <ScrollView
                ref={scrollRef}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                onScroll={handleScroll}
                scrollEventThrottle={16}
                onTouchEnd={() => setTimeout(() => ensureFocusedInputVisible(), 80)}
                contentContainerStyle={{ paddingBottom: 18 + keyboardPadding }}
              >
                {children}
              </ScrollView>
            </KeyboardAvoidingView>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ─── Event detail ────────────────────────────────────────────
export function EventSheet() {
  const { state, dispatch } = useStore();
  const [rescheduling, setRescheduling] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const profiles = state.profiles;
  const visible = state.modal?.kind === 'event';
  const ev = state.modal?.kind === 'event' ? state.modal.ev : null;

  const eventDay = ev?.day ?? toLocalISO(new Date());
  const [rescheduleDate, setRescheduleDate] = useState(eventDay);
  const [rescheduleStart, setRescheduleStart] = useState(ev?.start ?? '09:00');
  const [rescheduleEnd, setRescheduleEnd] = useState(ev?.end ?? '10:00');

  // Sync picker defaults when a new event opens
  useEffect(() => {
    if (ev) {
      setRescheduleDate(ev.day ?? toLocalISO(new Date()));
      setRescheduleStart(ev.start);
      setRescheduleEnd(ev.end);
      setShowReschedule(false);
    }
  }, [ev?.id]);

  if (!ev) return null;
  const event = ev;
  const viewer = state.viewer;
  const hidden = event.priv && event.who !== 'B' && event.who !== viewer;

  const reschedDateOptions = buildRescheduleDateOptions();

  function applyPreset(deltaDays: number) {
    const base = dateFromLocalISO(eventDay);
    base.setDate(base.getDate() + deltaDays);
    setRescheduleDate(toLocalISO(base));
  }

  async function confirmReschedule() {
    if (hidden || rescheduling) return;
    if (!/^\d{2}:\d{2}$/.test(rescheduleStart) || !/^\d{2}:\d{2}$/.test(rescheduleEnd)) {
      Alert.alert('Invalid time', 'Enter time as HH:MM');
      return;
    }
    setRescheduling(true);
    const previous = { start: event.start, end: event.end, day: eventDay };
    dispatch({ t: 'rescheduleEvent', id: event.id, start: rescheduleStart, end: rescheduleEnd, day: rescheduleDate });

    const { error } = await supabase.from('events').update({
      start_time: `${rescheduleStart}:00`,
      end_time: `${rescheduleEnd}:00`,
      event_date: rescheduleDate,
    }).eq('id', event.id);

    if (error) {
      dispatch({ t: 'rescheduleEvent', id: event.id, start: previous.start, end: previous.end, day: previous.day });
      Alert.alert('Could not reschedule', error.message);
      setRescheduling(false);
      return;
    }

    if (event.reminderOffsetMin !== null) {
      const oldNotifId = await AsyncStorage.getItem(REMINDER_NOTIF_KEY(event.id));
      await cancelNotif(oldNotifId);
      const newNotifId = await scheduleNotif(
        secondsUntil(rescheduleDate, rescheduleStart, event.reminderOffsetMin),
        'Event reminder',
        `${event.title} at ${rescheduleStart}`,
      );
      if (newNotifId) await AsyncStorage.setItem(REMINDER_NOTIF_KEY(event.id), newNotifId);
      else await AsyncStorage.removeItem(REMINDER_NOTIF_KEY(event.id));
    }

    setRescheduling(false);
    setShowReschedule(false);
  }

  return (
    <SheetShell visible={visible} onClose={() => dispatch({ t: 'closeModal' })}>
      <View style={[S.between, { marginBottom: 14 }]}>
        <Text style={sh.monoSm}>{ev.who === 'B' ? 'SHARED EVENT' : `${useName(ev.who, profiles).toUpperCase()}'S EVENT`}</Text>
        <TouchableOpacity onPress={() => dispatch({ t: 'closeModal' })} style={sh.closeBtn}>
          <Icon name="x" size={14} />
        </TouchableOpacity>
      </View>

      <Text style={sh.sheetH}>
        {hidden ? <>Private. <Text style={{ color: colors.fg9 }}>No details.</Text></> : ev.title}
      </Text>

      <View style={[S.row, { gap: 6, marginTop: 14, marginBottom: 18, flexWrap: 'wrap' }]}>
        <View style={sh.tagWrap}>
          <UserChip id={ev.who} priv={hidden} />
          <Text style={sh.tagText}>{hidden ? 'PRIVATE' : ev.who === 'B' ? 'TOGETHER' : useName(ev.who, profiles).toUpperCase()}</Text>
        </View>
        {ev.priv && (
          <View style={sh.tagWrap}>
            <Icon name="lock" size={10} />
            <Text style={sh.tagText}>PRIVATE</Text>
          </View>
        )}
        {!ev.priv && (
          <View style={[sh.tagWrap, { borderColor: 'transparent', backgroundColor: 'transparent' }]}>
            <Icon name="eye" size={10} color={colors.fg6} />
            <Text style={[sh.tagText, { color: colors.fg6 }]}>VISIBLE TO PARTNER</Text>
          </View>
        )}
      </View>

      <View style={[sh.infoCard, { marginBottom: 16 }]}>
        <View style={[S.row, { padding: 12, paddingHorizontal: 14, gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border06 }]}>
          <Icon name="timer" size={16} color={colors.fg2} />
          <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '500' }}>Time</Text>
          <Text style={{ fontFamily: 'Courier', fontSize: 13, fontWeight: '600' }}>{ev.start} — {ev.end}</Text>
        </View>
        {!hidden && ev.loc ? (
          <View style={[S.row, { padding: 12, paddingHorizontal: 14, gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border06 }]}>
            <Icon name="pin" size={16} color={colors.fg2} />
            <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '500' }}>Location</Text>
            <Text style={{ fontSize: 13, color: colors.fg3 }}>{ev.loc}</Text>
          </View>
        ) : null}
        <View style={[S.row, { padding: 12, paddingHorizontal: 14, gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border06 }]}>
          <Icon name="users" size={16} color={colors.fg2} />
          <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '500' }}>Who</Text>
          <Text style={{ fontSize: 13, color: colors.fg3 }}>{ev.who === 'B' ? 'Everyone' : useName(ev.who, profiles)}</Text>
        </View>
        {ev.reminderOffsetMin !== null && (
          <View style={[S.row, { padding: 12, paddingHorizontal: 14, gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border06 }]}>
            <Icon name="bell" size={16} color={colors.fg2} />
            <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '500' }}>Reminder</Text>
            <Text style={{ fontSize: 13, color: colors.fg3 }}>
              {REMINDER_OPTIONS.find(o => o.value === ev.reminderOffsetMin)?.label ?? `${ev.reminderOffsetMin} min before`}
            </Text>
          </View>
        )}
        <View style={[S.row, { padding: 12, paddingHorizontal: 14, gap: 12 }]}>
          <Icon name={ev.priv ? 'lock' : 'eye'} size={16} color={colors.fg2} />
          <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '500' }}>Visibility</Text>
          {ev.who === viewer
            ? <AppSwitch value={ev.priv} onChange={(v) => {
                dispatch({ t: 'togglePriv', v });
                supabase.from('events').update({ is_private: v }).eq('id', ev.id);
              }} />
            : <Text style={{ fontFamily: 'Courier', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.6, color: colors.fg5 }}>{ev.priv ? 'PRIVATE' : 'PUBLIC'}</Text>}
        </View>
      </View>

      {/* ── Reschedule section ── */}
      {!hidden && (
        <View style={{ marginBottom: 12 }}>
          <TouchableOpacity
            style={[sh.btnOutline, { marginBottom: showReschedule ? 12 : 0 }]}
            onPress={() => setShowReschedule(v => !v)}
          >
            <Text style={sh.btnOutlineTxt}>{showReschedule ? 'Cancel reschedule' : 'Reschedule'}</Text>
          </TouchableOpacity>

          {showReschedule && (
            <View style={{ gap: 14 }}>
              {/* Presets */}
              <View>
                <Text style={[sh.fieldLabel, { marginBottom: 6 }]}>PRESETS</Text>
                <View style={[S.row, { flexWrap: 'wrap', gap: 6 }]}>
                  {[
                    { label: 'Tomorrow', days: 1 },
                    { label: '+2 days',  days: 2 },
                    { label: '+1 week',  days: 7 },
                    { label: '+2 weeks', days: 14 },
                    { label: '+1 month', days: 30 },
                    { label: '−1 day',   days: -1 },
                    { label: '−1 week',  days: -7 },
                  ].map(p => {
                    const base = dateFromLocalISO(eventDay);
                    base.setDate(base.getDate() + p.days);
                    const iso = toLocalISO(base);
                    const active = rescheduleDate === iso;
                    return (
                      <TouchableOpacity
                        key={p.label}
                        onPress={() => applyPreset(p.days)}
                        style={{
                          height: 30, paddingHorizontal: 12, borderRadius: 9999,
                          justifyContent: 'center', borderWidth: 1,
                          backgroundColor: active ? colors.foreground : colors.bgTint04,
                          borderColor: active ? colors.foreground : colors.border08,
                        }}
                      >
                        <Text style={{ fontFamily: 'Courier', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase',
                          color: active ? '#fff' : colors.fg3 }}>{p.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Date strip */}
              <View>
                <Text style={[sh.fieldLabel, { marginBottom: 6 }]}>DATE</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {reschedDateOptions.map(o => {
                    const active = rescheduleDate === o.iso;
                    return (
                      <TouchableOpacity
                        key={o.iso}
                        onPress={() => setRescheduleDate(o.iso)}
                        style={{
                          height: 32, paddingHorizontal: 12, borderRadius: 9999,
                          justifyContent: 'center', borderWidth: 1,
                          backgroundColor: active ? colors.foreground : colors.bgTint04,
                          borderColor: active ? colors.foreground : colors.border08,
                        }}
                      >
                        <Text style={{ fontFamily: 'Courier', fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase',
                          color: active ? '#fff' : colors.fg3 }}>{o.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Time inputs */}
              <View style={S.row}>
                <View style={[sh.field, { flex: 1, marginRight: 5 }]}>
                  <Text style={sh.fieldLabel}>START TIME</Text>
                  <TextInput
                    style={sh.fieldInput}
                    value={rescheduleStart}
                    onChangeText={setRescheduleStart}
                    placeholder="HH:MM"
                    placeholderTextColor={colors.fg6}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
                <View style={[sh.field, { flex: 1, marginLeft: 5 }]}>
                  <Text style={sh.fieldLabel}>END TIME</Text>
                  <TextInput
                    style={sh.fieldInput}
                    value={rescheduleEnd}
                    onChangeText={setRescheduleEnd}
                    placeholder="HH:MM"
                    placeholderTextColor={colors.fg6}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
              </View>

              {/* Confirm */}
              <TouchableOpacity
                style={[sh.btnPrimary, rescheduling && { opacity: 0.5 }]}
                onPress={confirmReschedule}
                disabled={rescheduling}
              >
                {rescheduling
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={sh.btnPrimaryTxt}>Confirm reschedule</Text>}
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      <View style={[S.row, { gap: 10 }]}>
        <TouchableOpacity style={[sh.btnOutline, { borderColor: colors.destructive }]} onPress={() => {
          Alert.alert(
            'Delete event',
            `Delete "${ev.title}"? This can't be undone.`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: async () => {
                const notifId = await AsyncStorage.getItem(REMINDER_NOTIF_KEY(ev.id));
                await cancelNotif(notifId);
                await AsyncStorage.removeItem(REMINDER_NOTIF_KEY(ev.id));
                await supabase.from('events').delete().eq('id', ev.id);
                dispatch({ t: 'closeModal' });
              }},
            ]
          );
        }}>
          <Text style={[sh.btnOutlineTxt, { color: colors.destructive }]}>Delete</Text>
        </TouchableOpacity>
        <TouchableOpacity style={sh.btnPrimary} onPress={() => dispatch({ t: 'closeModal' })}><Text style={sh.btnPrimaryTxt}>Done</Text></TouchableOpacity>
      </View>
    </SheetShell>
  );
}

// ─── helpers ────────────────────────────────────────────────
function dateFromLocalISO(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function toLocalISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function hmFromDate(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function shiftedEventTime(ev: CalEvent, deltaMinutes: number): { start: string; end: string; day: string } {
  const base = dateFromLocalISO(ev.day ?? toLocalISO(new Date()));
  const [startH, startM] = ev.start.split(':').map(Number);
  const [endH, endM] = ev.end.split(':').map(Number);
  const start = new Date(base);
  start.setHours(startH, startM + deltaMinutes, 0, 0);
  const end = new Date(base);
  end.setHours(endH, endM + deltaMinutes, 0, 0);
  if (end <= start) end.setDate(end.getDate() + 1);

  return {
    start: hmFromDate(start),
    end: hmFromDate(end),
    day: toLocalISO(start),
  };
}

function buildDateOptions(): { iso: string; label: string }[] {
  const options: { iso: string; label: string }[] = [];
  const today = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const iso = toLocalISO(d);
    let label: string;
    if (i === 0) label = 'TODAY';
    else if (i === 1) label = 'TOMORROW';
    else label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
    options.push({ iso, label });
  }
  return options;
}

function buildRescheduleDateOptions(): { iso: string; label: string }[] {
  const options: { iso: string; label: string }[] = [];
  const today = new Date();
  for (let i = -7; i <= 60; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const iso = toLocalISO(d);
    let label: string;
    if (i === -1) label = 'YESTERDAY';
    else if (i === 0) label = 'TODAY';
    else if (i === 1) label = 'TOMORROW';
    else label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
    options.push({ iso, label });
  }
  return options;
}

// ─── Add Event ───────────────────────────────────────────────
export function AddEventSheet() {
  const { state, dispatch } = useStore();
  const visible = state.modal?.kind === 'addEvent';
  const viewer = state.viewer;
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('14:00');
  const [end, setEnd] = useState('15:00');
  const [who, setWho] = useState<UserId | 'B'>(viewer);
  const [priv, setPriv] = useState(false);
  const [loc, setLoc] = useState('');
  const [reminder, setReminder] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [eventDate, setEventDate] = useState(toLocalISO(new Date()));

  const dateOptions = buildDateOptions();
  const selectedDateLabel = dateOptions.find(o => o.iso === eventDate)?.label
    ?? new Date(eventDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();

  async function save() {
    if (!title.trim() || !state.householdId || !state.userId) {
      dispatch({ t: 'closeModal' });
      return;
    }
    setSaving(true);

    const { data: inserted } = await supabase.from('events').insert({
      household_id: state.householdId,
      owner_id: state.userId,
      title: title.trim(),
      start_time: start + ':00',
      end_time: end + ':00',
      event_date: eventDate,
      location: loc.trim(),
      who,
      is_private: priv,
      reminder_offset_min: reminder,
    }).select('id').single();

    if (inserted?.id && reminder !== null) {
      const secs = secondsUntil(eventDate, start, reminder);
      const reminderLabel = REMINDER_OPTIONS.find(o => o.value === reminder)?.label ?? '';
      const notifId = await scheduleNotif(
        secs,
        `📅 ${title.trim()}`,
        reminder === 0 ? 'Starting now' : `${reminderLabel} — starts at ${start}`,
      );
      if (notifId) {
        await AsyncStorage.setItem(REMINDER_NOTIF_KEY(inserted.id), notifId);
      }
    }

    await writeActivity(state.householdId, state.userId, viewer,
      'added', title.trim(), 'event',
      who !== viewer ? { title: 'New event added', body: `${title.trim()} at ${start}`, forUser: who } : undefined
    );
    setSaving(false);
    setTitle(''); setLoc(''); setStart('14:00'); setEnd('15:00'); setPriv(false); setWho(viewer); setReminder(null);
    setEventDate(toLocalISO(new Date()));
    dispatch({ t: 'closeModal' });
  }

  return (
    <SheetShell visible={visible} onClose={() => dispatch({ t: 'closeModal' })}>
      <View style={[S.between, { marginBottom: 14 }]}>
        <Text style={sh.monoSm}>NEW EVENT · {selectedDateLabel}</Text>
        <TouchableOpacity onPress={() => dispatch({ t: 'closeModal' })} style={sh.closeBtn}>
          <Icon name="x" size={14} />
        </TouchableOpacity>
      </View>
      <Text style={sh.sheetH}>Add to <Text style={{ color: colors.fg9 }}>the grid.</Text></Text>

      <View style={{ gap: 10, marginTop: 18 }}>
        <View style={sh.field}>
          <Text style={sh.fieldLabel}>EVENT</Text>
          <TextInput style={sh.fieldInput} placeholder="e.g. Lunch with parents" placeholderTextColor={colors.fg6} value={title} onChangeText={setTitle} />
        </View>

        {/* Date picker */}
        <View style={sh.field}>
          <Text style={sh.fieldLabel}>DATE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }} contentContainerStyle={{ gap: 6 }}>
            {dateOptions.map(o => {
              const active = eventDate === o.iso;
              return (
                <TouchableOpacity key={o.iso} onPress={() => setEventDate(o.iso)}
                  style={{ height: 32, paddingHorizontal: 12, borderRadius: 9999, justifyContent: 'center',
                    backgroundColor: active ? colors.foreground : colors.bgTint04,
                    borderWidth: 1, borderColor: active ? colors.foreground : colors.border08 }}>
                  <Text style={{ fontFamily: 'Courier', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2,
                    color: active ? '#fff' : colors.fg3 }}>{o.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <View style={S.row}>
          <View style={[sh.field, { flex: 1, marginRight: 5 }]}>
            <Text style={sh.fieldLabel}>STARTS</Text>
            <TextInput style={sh.fieldInput} value={start} onChangeText={setStart} placeholder="HH:MM" placeholderTextColor={colors.fg6} />
          </View>
          <View style={[sh.field, { flex: 1, marginLeft: 5 }]}>
            <Text style={sh.fieldLabel}>ENDS</Text>
            <TextInput style={sh.fieldInput} value={end} onChangeText={setEnd} placeholder="HH:MM" placeholderTextColor={colors.fg6} />
          </View>
        </View>
        <View style={sh.field}>
          <Text style={sh.fieldLabel}>LOCATION</Text>
          <TextInput style={sh.fieldInput} placeholder="Optional" placeholderTextColor={colors.fg6} value={loc} onChangeText={setLoc} />
        </View>
        <View style={sh.field}>
          <Text style={sh.fieldLabel}>WHO</Text>
          <View style={[S.row, { flexWrap: 'wrap', gap: 6, marginTop: 4 }]}>
            {[
              ...USER_LIST.filter(u => state.profiles[u]).map(u => ({
                v: u as UserId | 'B',
                label: u === viewer ? 'You' : (state.profiles[u]?.displayName ?? u),
                chip: u as UserId | 'B',
              })),
              { v: 'B' as const, label: 'All', chip: 'B' as const },
            ].map(o => (
              <TouchableOpacity key={o.v} onPress={() => setWho(o.v)}
                style={[S.row, { height: 36, paddingHorizontal: 10, borderRadius: 10, gap: 6, justifyContent: 'center',
                  backgroundColor: who === o.v ? colors.foreground : 'transparent',
                  borderWidth: 1, borderColor: who === o.v ? colors.foreground : colors.border08 }]}>
                <UserChip id={o.chip} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: who === o.v ? '#fff' : colors.fg2 }}>{o.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={sh.field}>
          <Text style={sh.fieldLabel}>REMINDER</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }} contentContainerStyle={{ gap: 6 }}>
            {REMINDER_OPTIONS.map(o => {
              const active = reminder === o.value;
              return (
                <TouchableOpacity key={String(o.value)} onPress={() => setReminder(o.value)}
                  style={{ height: 32, paddingHorizontal: 12, borderRadius: 9999, justifyContent: 'center',
                    backgroundColor: active ? colors.foreground : colors.bgTint04,
                    borderWidth: 1, borderColor: active ? colors.foreground : colors.border08 }}>
                  <Text style={{ fontFamily: 'Courier', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5,
                    color: active ? '#fff' : colors.fg3 }}>{o.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
        <View style={[sh.infoCard, S.row, { gap: 12 }]}>
          <Icon name={priv ? 'lock' : 'eye'} size={16} color={colors.fg2} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13.5, fontWeight: '600' }}>{priv ? 'Private' : 'Public'}</Text>
            <Text style={{ fontFamily: 'Courier', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.6, color: colors.fg5, marginTop: 3 }}>
              {priv ? "PARTNER SEES 'BUSY' · NO DETAILS" : 'PARTNER SEES TITLE + LOCATION'}
            </Text>
          </View>
          <AppSwitch value={priv} onChange={setPriv} />
        </View>
      </View>

      <View style={[S.row, { gap: 10, marginTop: 18 }]}>
        <TouchableOpacity style={sh.btnOutline} onPress={() => dispatch({ t: 'closeModal' })}><Text style={sh.btnOutlineTxt}>Cancel</Text></TouchableOpacity>
        <TouchableOpacity style={sh.btnPrimary} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={sh.btnPrimaryTxt}>Add to {selectedDateLabel === 'TODAY' ? 'today' : selectedDateLabel === 'TOMORROW' ? 'tomorrow' : 'grid'}</Text>}
        </TouchableOpacity>
      </View>
    </SheetShell>
  );
}

// ─── Add Todo ────────────────────────────────────────────────
export function AddTodoSheet() {
  const { state, dispatch } = useStore();
  const visible = state.modal?.kind === 'addTodo';
  const viewer = state.viewer;
  const activeSlots = USER_LIST.filter(u => state.profiles[u]);
  const otherSlots = activeSlots.filter(u => u !== viewer);
  const multiMember = activeSlots.length > 2;

  const [text, setText] = useState('');
  const [shared, setShared] = useState(true);
  // sharedWith: null = everyone; when multiMember and shared, user picks a subset
  const [sharedWith, setSharedWith] = useState<UserId[] | null>(null);
  const [due, setDue] = useState('TODAY');
  const [p, setP] = useState<1 | 2 | 3>(2);
  const [assignedTo, setAssignedTo] = useState<UserId[]>([]);
  const [pendingSubtasks, setPendingSubtasks] = useState<string[]>([]);
  const [newSubtaskText, setNewSubtaskText] = useState('');
  const [saving, setSaving] = useState(false);

  function addPendingSubtask() {
    if (!newSubtaskText.trim()) return;
    setPendingSubtasks([...pendingSubtasks, newSubtaskText.trim()]);
    setNewSubtaskText('');
  }

  // When shared is turned off, reset sharedWith
  function handleSetShared(v: boolean) {
    setShared(v);
    if (!v) setSharedWith(null);
  }

  function toggleMember(u: UserId) {
    setSharedWith(prev => {
      // null means everyone — clicking a member switches to explicit selection
      const current = prev ?? activeSlots;
      const next = current.includes(u) ? current.filter(x => x !== u) : [...current, u];
      // if all active slots are selected, collapse back to null (everyone)
      return next.length === activeSlots.length ? null : next.length === 0 ? [viewer] : next;
    });
  }

  function toggleAssignee(u: UserId) {
    setAssignedTo(prev => prev.includes(u) ? prev.filter(x => x !== u) : [...prev, u]);
  }

  async function save() {
    if (!text.trim() || !state.householdId || !state.userId) {
      dispatch({ t: 'closeModal' });
      return;
    }
    setSaving(true);
    // For single/two-member households sharedWith is always null (everyone)
    const finalSharedWith = shared && multiMember && sharedWith ? sharedWith : null;
    
    // Insert parent task and select its id
    const { data: inserted } = await supabase.from('todos').insert({
      household_id: state.householdId,
      owner_id: state.userId,
      text: text.trim(),
      is_shared: shared,
      shared_with: finalSharedWith,
      is_done: false,
      due_label: due,
      priority: p,
      assigned_to: assignedTo.length === 0 ? null : assignedTo,
    }).select('id').single();

    // Insert subtasks if we have them and parent insertion succeeded
    if (inserted?.id && pendingSubtasks.length > 0) {
      const subtaskRows = pendingSubtasks.map(subText => ({
        household_id: state.householdId,
        owner_id: state.userId,
        text: subText,
        is_shared: shared,
        shared_with: finalSharedWith,
        is_done: false,
        due_label: due,
        priority: p,
        parent_id: inserted.id,
      }));
      await supabase.from('todos').insert(subtaskRows);
    }

    await writeActivity(state.householdId, state.userId, viewer,
      'added', text.trim(), 'todo',
      shared ? { title: 'New shared to-do', body: text.trim(), forUser: 'B' } : undefined
    );
    setSaving(false);
    setText(''); setShared(true); setSharedWith(null); setDue('TODAY'); setP(2); setAssignedTo([]);
    setPendingSubtasks([]); setNewSubtaskText('');
    dispatch({ t: 'closeModal' });
  }

  // Label for the sharing info card
  const sharingLabel = !shared
    ? 'Personal'
    : sharedWith === null
      ? 'Everyone'
      : sharedWith.map(u => state.profiles[u]?.displayName ?? u).join(', ');

  const sharingSubLabel = !shared
    ? 'ONLY YOU SEE IT'
    : sharedWith === null
      ? `ALL ${activeSlots.length} MEMBERS SEE IT`
      : 'SELECTED MEMBERS ONLY';

  return (
    <SheetShell visible={visible} onClose={() => dispatch({ t: 'closeModal' })}>
      <View style={[S.between, { marginBottom: 14 }]}>
        <Text style={sh.monoSm}>NEW TO-DO</Text>
        <TouchableOpacity onPress={() => dispatch({ t: 'closeModal' })} style={sh.closeBtn}><Icon name="x" size={14} /></TouchableOpacity>
      </View>
      <Text style={sh.sheetH}>One small <Text style={{ color: colors.fg9 }}>thing.</Text></Text>

      <View style={{ gap: 10, marginTop: 18 }}>
        <View style={sh.field}>
          <Text style={sh.fieldLabel}>TO-DO</Text>
          <TextInput style={sh.fieldInput} autoFocus placeholder="e.g. Buy fresh herbs" placeholderTextColor={colors.fg6} value={text} onChangeText={setText} />
        </View>
        <View style={sh.field}>
          <Text style={sh.fieldLabel}>DUE</Text>
          <View style={[S.row, { flexWrap: 'wrap', gap: 6, marginTop: 4 }]}>
            {['TODAY', 'TOMORROW', 'THIS WEEK', 'LATER'].map(d => (
              <TouchableOpacity key={d} onPress={() => setDue(d)}
                style={{ height: 32, paddingHorizontal: 10, borderRadius: 9, justifyContent: 'center',
                  backgroundColor: due === d ? colors.foreground : 'transparent',
                  borderWidth: 1, borderColor: due === d ? colors.foreground : colors.border08 }}>
                <Text style={{ fontFamily: 'Courier', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.5, color: due === d ? '#fff' : colors.fg3 }}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={sh.field}>
          <Text style={sh.fieldLabel}>PRIORITY</Text>
          <View style={[S.row, { gap: 6, marginTop: 4 }]}>
            {([1, 2, 3] as const).map(n => (
              <TouchableOpacity key={n} onPress={() => setP(n)}
                style={{ flex: 1, height: 32, borderRadius: 9, justifyContent: 'center', alignItems: 'center',
                  backgroundColor: p === n ? colors.foreground : 'transparent',
                  borderWidth: 1, borderColor: p === n ? colors.foreground : colors.border08 }}>
                <Text style={{ fontFamily: 'Courier', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5, color: p === n ? '#fff' : colors.fg3 }}>P{n}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={sh.field}>
          <Text style={sh.fieldLabel}>ASSIGN TO</Text>
          <View style={[S.row, { flexWrap: 'wrap', gap: 6, marginTop: 4 }]}>
            {[
              { v: null, label: 'Unassigned' },
              ...activeSlots.map(u => ({
                v: u,
                label: u === viewer ? 'You' : (state.profiles[u]?.displayName ?? u),
              })),
            ].map(o => {
              const active = o.v === null
                ? assignedTo.length === 0
                : assignedTo.includes(o.v);
              const onPress = o.v === null
                ? () => setAssignedTo([])
                : () => toggleAssignee(o.v as UserId);

              return (
                <TouchableOpacity key={o.v === null ? 'null' : o.v} onPress={onPress}
                  style={[S.row, { height: 36, paddingHorizontal: 10, borderRadius: 10, gap: 6, justifyContent: 'center',
                    backgroundColor: active ? colors.foreground : 'transparent',
                    borderWidth: 1, borderColor: active ? colors.foreground : colors.border08 }]}>
                  {o.v && <UserChip id={o.v} />}
                  <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : colors.fg2 }}>{o.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={sh.field}>
          <Text style={sh.fieldLabel}>SUBTASKS ({pendingSubtasks.length})</Text>
          
          {pendingSubtasks.map((sub, idx) => (
            <View key={idx} style={[S.between, { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border06 }]}>
              <Text style={{ fontSize: 13, fontWeight: '500', color: colors.fg2 }}>└─ {sub}</Text>
              <TouchableOpacity onPress={() => setPendingSubtasks(pendingSubtasks.filter((_, i) => i !== idx))}>
                <Icon name="x" size={12} color={colors.destructive} />
              </TouchableOpacity>
            </View>
          ))}

          <View style={[S.row, { gap: 8, marginTop: 8 }]}>
            <TextInput
              style={{ flex: 1, fontSize: 13.5, height: 32, color: colors.fg1, padding: 0 }}
              placeholder="Add subtask..."
              placeholderTextColor={colors.fg7}
              value={newSubtaskText}
              onChangeText={setNewSubtaskText}
              onSubmitEditing={addPendingSubtask}
              returnKeyType="done"
            />
            <TouchableOpacity onPress={addPendingSubtask} disabled={!newSubtaskText.trim()}
              style={{ width: 26, height: 26, borderRadius: 6, backgroundColor: newSubtaskText.trim() ? colors.foreground : colors.bgTint06, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="plus" size={10} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Shared toggle + member picker */}
        <View style={[sh.infoCard, { gap: 12 }]}>
          <View style={[S.row, { gap: 12 }]}>
            <UserChip id={shared ? 'B' : viewer} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13.5, fontWeight: '600' }}>{sharingLabel}</Text>
              <Text style={{ fontFamily: 'Courier', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.6, color: colors.fg5, marginTop: 3 }}>
                {sharingSubLabel}
              </Text>
            </View>
            <AppSwitch value={shared} onChange={handleSetShared} />
          </View>

          {/* Member picker: only shown when shared + 3 or more members */}
          {shared && multiMember && (
            <View style={{ borderTopWidth: 1, borderTopColor: colors.border06, paddingTop: 10, gap: 6 }}>
              <Text style={{ fontFamily: 'Courier', fontSize: 9, textTransform: 'uppercase', letterSpacing: 2, color: colors.fg5 }}>SHARE WITH</Text>
              <View style={[S.row, { flexWrap: 'wrap', gap: 6, marginTop: 2 }]}>
                {/* "Everyone" option */}
                <TouchableOpacity
                  onPress={() => setSharedWith(null)}
                  style={[S.row, { height: 34, paddingHorizontal: 10, borderRadius: 10, gap: 6,
                    backgroundColor: sharedWith === null ? colors.foreground : 'transparent',
                    borderWidth: 1, borderColor: sharedWith === null ? colors.foreground : colors.border08 }]}>
                  <UserChip id='B' />
                  <Text style={{ fontFamily: 'Courier', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5,
                    color: sharedWith === null ? '#fff' : colors.fg3 }}>Everyone</Text>
                </TouchableOpacity>
                {/* One chip per other member */}
                {otherSlots.map(u => {
                  const selected = sharedWith === null || sharedWith.includes(u);
                  return (
                    <TouchableOpacity key={u}
                      onPress={() => toggleMember(u)}
                      style={[S.row, { height: 34, paddingHorizontal: 10, borderRadius: 10, gap: 6,
                        backgroundColor: selected ? colors.foreground : 'transparent',
                        borderWidth: 1, borderColor: selected ? colors.foreground : colors.border08 }]}>
                      <UserChip id={u} />
                      <Text style={{ fontFamily: 'Courier', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5,
                        color: selected ? '#fff' : colors.fg3 }}>
                        {state.profiles[u]?.displayName ?? u}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
        </View>
      </View>

      <View style={[S.row, { gap: 10, marginTop: 18 }]}>
        <TouchableOpacity style={sh.btnOutline} onPress={() => dispatch({ t: 'closeModal' })}><Text style={sh.btnOutlineTxt}>Cancel</Text></TouchableOpacity>
        <TouchableOpacity style={sh.btnPrimary} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={sh.btnPrimaryTxt}>Add to list</Text>}
        </TouchableOpacity>
      </View>
    </SheetShell>
  );
}


// ─── To-do Detail Sheet ──────────────────────────────────────
export function TodoDetailSheet() {
  const { state, dispatch } = useStore();
  const visible = state.modal?.kind === 'todoDetail';
  const parent = state.modal?.kind === 'todoDetail' ? state.modal.todo : null;

  const [subText, setSubText] = useState('');
  const [addingSub, setAddingSub] = useState(false);

  if (!parent) return null;

  const viewer = state.viewer;
  const activeSlots = USER_LIST.filter(u => state.profiles[u]);
  const subTodos = state.todos.filter(t => t.parentId === parent.id);
  const doneCount = subTodos.filter(t => t.done).length;
  const totalCount = subTodos.length;
  const progressPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  async function addSubTodo() {
    if (!parent) return;
    if (!subText.trim() || !state.householdId || !state.userId) return;
    setAddingSub(true);
    const textVal = subText.trim();
    setSubText('');
    await supabase.from('todos').insert({
      household_id: state.householdId,
      owner_id: state.userId,
      text: textVal,
      is_shared: parent.shared,
      shared_with: parent.sharedWith,
      is_done: false,
      due_label: parent.due,
      priority: parent.p,
      parent_id: parent.id,
    });
    setAddingSub(false);
  }

  async function toggleAssignee(u: UserId) {
    if (!parent) return;
    const current = parent.assignedTo || [];
    const next = current.includes(u) ? current.filter(x => x !== u) : [...current, u];
    await supabase.from('todos').update({ assigned_to: next.length === 0 ? null : next }).eq('id', parent.id);
  }

  async function clearAssignees() {
    if (!parent) return;
    await supabase.from('todos').update({ assigned_to: null }).eq('id', parent.id);
  }

  async function deleteTodo() {
    if (!parent) return;
    Alert.alert('Delete To-do', 'Delete this to-do and all its subtasks? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!parent) return;
          await supabase.from('todos').delete().eq('id', parent.id);
          dispatch({ t: 'closeModal' });
        },
      },
    ]);
  }

  return (
    <SheetShell visible={visible} onClose={() => dispatch({ t: 'closeModal' })}>
      <View style={[S.between, { marginBottom: 14 }]}>
        <Text style={sh.monoSm}>{parent.shared ? 'SHARED TO-DO' : 'PERSONAL TO-DO'}</Text>
        <TouchableOpacity onPress={() => dispatch({ t: 'closeModal' })} style={sh.closeBtn}>
          <Icon name="x" size={14} />
        </TouchableOpacity>
      </View>

      <Text style={sh.sheetH}>{parent.text}</Text>

      <View style={[S.row, { gap: 6, marginTop: 14, marginBottom: 18, flexWrap: 'wrap' }]}>
        <View style={sh.tagWrap}>
          <Text style={sh.tagText}>DUE: {parent.due}</Text>
        </View>
        <View style={sh.tagWrap}>
          <Text style={sh.tagText}>PRIORITY: P{parent.p}</Text>
        </View>
        <View style={sh.tagWrap}>
          <UserChip id={parent.who} />
          <Text style={sh.tagText}>CREATED BY {state.profiles[parent.who]?.displayName?.toUpperCase() ?? 'N/A'}</Text>
        </View>
      </View>

      {/* Assignment Section */}
      <SecLabel>Assignee</SecLabel>
      <View style={[sh.infoCard, { marginBottom: 20 }]}>
        <View style={[S.row, { flexWrap: 'wrap', gap: 6 }]}>
          {[
            { v: null, label: 'Unassigned' },
            ...activeSlots.map(u => ({
              v: u,
              label: u === viewer ? 'You' : (state.profiles[u]?.displayName ?? u),
            })),
          ].map(o => {
            const active = o.v === null
              ? (!parent.assignedTo || parent.assignedTo.length === 0)
              : (parent.assignedTo?.includes(o.v) ?? false);
            const onPress = o.v === null
              ? clearAssignees
              : () => toggleAssignee(o.v as UserId);

            return (
              <TouchableOpacity key={o.v === null ? 'null' : o.v} onPress={onPress}
                style={[S.row, { height: 34, paddingHorizontal: 10, borderRadius: 10, gap: 6, justifyContent: 'center',
                  backgroundColor: active ? colors.foreground : 'transparent',
                  borderWidth: 1, borderColor: active ? colors.foreground : colors.border08 }]}>
                {o.v && <UserChip id={o.v} />}
                <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : colors.fg2 }}>{o.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Subtasks Section */}
      <SecLabel count={totalCount}>Subtasks</SecLabel>
      <Card style={{ padding: 4, marginBottom: 16 }}>
        {totalCount > 0 && (
          <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border06 }}>
            <View style={[S.between, { marginBottom: 6 }]}>
              <Text style={{ fontFamily: 'Courier', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.5, color: colors.fg5 }}>PROGRESS</Text>
              <Text style={{ fontFamily: 'Courier', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.5, color: colors.fg5 }}>{doneCount}/{totalCount} COMPLETED ({progressPct}%)</Text>
            </View>
            <View style={{ height: 6, backgroundColor: colors.bgTint06, borderRadius: 3, overflow: 'hidden' }}>
              <View style={{ width: `${progressPct}%`, height: '100%', backgroundColor: colors.foreground }} />
            </View>
          </View>
        )}

        {subTodos.length === 0 ? (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: colors.fg6, fontWeight: '400' }}>No subtasks yet. Break it down!</Text>
          </View>
        ) : (
          subTodos.map((sub, i) => (
            <TouchableOpacity key={sub.id} onPress={() => toggleTodoItem(sub, state, dispatch)}
              style={[S.row, { padding: 12, paddingHorizontal: 14, gap: 10,
                borderBottomWidth: i < subTodos.length - 1 ? 1 : 0, borderBottomColor: colors.border06 }]}>
              <View style={{ width: 18, height: 18, borderRadius: 5, borderWidth: 1.5,
                borderColor: sub.done ? colors.foreground : colors.border20,
                backgroundColor: sub.done ? colors.foreground : '#fff',
                alignItems: 'center', justifyContent: 'center' }}>
                {sub.done && <Icon name="check" size={10} color="#fff" strokeWidth={2.5} />}
              </View>
              <Text style={{ fontSize: 13.5, fontWeight: '500', color: sub.done ? colors.fg6 : colors.fg1, textDecorationLine: sub.done ? 'line-through' : 'none', flex: 1 }}>
                {sub.text}
              </Text>
            </TouchableOpacity>
          ))
        )}
      </Card>

      {/* Inline Subtask Adder */}
      <View style={[sh.field, { marginBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }]}>
        <TextInput
          style={[sh.fieldInput, { flex: 1, height: 32 }]}
          placeholder="Add a subtask..."
          placeholderTextColor={colors.fg7}
          value={subText}
          onChangeText={setSubText}
          onSubmitEditing={addSubTodo}
          returnKeyType="done"
        />
        <TouchableOpacity onPress={addSubTodo} disabled={addingSub || !subText.trim()}
          style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: subText.trim() ? colors.foreground : colors.bgTint06, alignItems: 'center', justifyContent: 'center' }}>
          {addingSub ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="plus" size={12} color="#fff" />}
        </TouchableOpacity>
      </View>

      {/* Delete / Actions */}
      <View style={[S.row, { gap: 10 }]}>
        <TouchableOpacity style={[sh.btnOutline, { borderColor: colors.destructive }]} onPress={deleteTodo}>
          <Text style={[sh.btnOutlineTxt, { color: colors.destructive }]}>Delete To-do</Text>
        </TouchableOpacity>
        <TouchableOpacity style={sh.btnPrimary} onPress={() => dispatch({ t: 'closeModal' })}>
          <Text style={sh.btnPrimaryTxt}>Close</Text>
        </TouchableOpacity>
      </View>
    </SheetShell>
  );
}

// ─── Add Channel ─────────────────────────────────────────────
export function AddChannelSheet() {
  const { state, dispatch } = useStore();
  const visible = state.modal?.kind === 'addChannel';
  const viewer = state.viewer;
  const activeSlots = USER_LIST.filter(u => state.profiles[u]);

  const [name, setName] = useState('');
  const [members, setMembers] = useState<UserId[]>([]);
  const [passphrase, setPassphrase] = useState('');
  const [saving, setSaving] = useState(false);

  function toggleMember(u: UserId) {
    setMembers(prev => prev.includes(u) ? prev.filter(x => x !== u) : [...prev, u]);
  }

  async function save() {
    if (!name.trim() || !state.householdId || !state.userId) {
      dispatch({ t: 'closeModal' });
      return;
    }
    setSaving(true);
    try {
      const channelName = name.trim();
      const finalMembers = members.length === 0 ? null : members;

      let passphraseCheck: string | null = null;
      let channelKey: string | null = null;

      if (passphrase.trim()) {
        const rawPassphrase = passphrase.trim();
        channelKey = deriveKey(rawPassphrase);
        passphraseCheck = encryptText('CHANNEL_UNLOCKED', channelKey);
      }

      // 1. Insert into Supabase channels table
      const { data: inserted, error } = await supabase.from('channels').insert({
        household_id: state.householdId,
        name: channelName,
        created_by: state.userId,
        members: finalMembers,
        passphrase_check: passphraseCheck,
      }).select('id').single();

      if (error) throw error;

      // 2. If E2EE passcode was assigned, save key in SecureStore locally
      if (inserted?.id && channelKey) {
        await SecureStore.setItemAsync(`channel_key_${inserted.id}`, channelKey);
      }

      // 3. Log activity
      await writeActivity(
        state.householdId,
        state.userId,
        state.viewer,
        'created channel',
        channelName,
        'chat'
      );

      // Reset state and close modal
      setName('');
      setMembers([]);
      setPassphrase('');
      dispatch({ t: 'closeModal' });

      // Automatically select this channel in state
      if (inserted?.id) {
        dispatch({ t: 'setActiveChannel', channelId: inserted.id });
      }
    } catch (err) {
      console.warn('Create channel error:', err);
      Alert.alert('Error', 'Failed to create channel.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SheetShell visible={visible} onClose={() => dispatch({ t: 'closeModal' })}>
      <View style={[S.between, { marginBottom: 14 }]}>
        <Text style={sh.monoSm}>NEW CHANNEL</Text>
        <TouchableOpacity onPress={() => dispatch({ t: 'closeModal' })} style={sh.closeBtn}>
          <Icon name="x" size={14} />
        </TouchableOpacity>
      </View>
      <Text style={sh.sheetH}>Create a <Text style={{ color: colors.fg9 }}>room.</Text></Text>

      <View style={{ gap: 10, marginTop: 18 }}>
        <View style={sh.field}>
          <Text style={sh.fieldLabel}>CHANNEL NAME</Text>
          <TextInput style={sh.fieldInput} placeholder="e.g. Design Sync" placeholderTextColor={colors.fg6} value={name} onChangeText={setName} />
        </View>

        <View style={sh.field}>
          <Text style={sh.fieldLabel}>RESTRICT ACCESS (OPTIONAL)</Text>
          <Text style={{ fontSize: 11, color: colors.fg5, marginBottom: 4 }}>Restrict access to select members. Leave empty for public access.</Text>
          <View style={[S.row, { flexWrap: 'wrap', gap: 6 }]}>
            {activeSlots.map(u => {
              const selected = members.includes(u);
              return (
                <TouchableOpacity key={u} onPress={() => toggleMember(u)}
                  style={[S.row, { height: 34, paddingHorizontal: 10, borderRadius: 10, gap: 6,
                    backgroundColor: selected ? colors.foreground : 'transparent',
                    borderWidth: 1, borderColor: selected ? colors.foreground : colors.border08 }]}>
                  <UserChip id={u} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: selected ? '#fff' : colors.fg2 }}>
                    {u === viewer ? 'You' : (state.profiles[u]?.displayName ?? u)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={sh.field}>
          <Text style={sh.fieldLabel}>E2EE PASSPHRASE (OPTIONAL)</Text>
          <Text style={{ fontSize: 11, color: colors.fg5, marginBottom: 4 }}>Optional end-to-end encryption passphrase to secure channel messages.</Text>
          <TextInput
            secureTextEntry
            style={sh.fieldInput}
            placeholder="Super secret passphrase"
            placeholderTextColor={colors.fg6}
            value={passphrase}
            onChangeText={setPassphrase}
          />
        </View>
      </View>

      <View style={[S.row, { gap: 10, marginTop: 18 }]}>
        <TouchableOpacity style={sh.btnOutline} onPress={() => dispatch({ t: 'closeModal' })}>
          <Text style={sh.btnOutlineTxt}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={sh.btnPrimary} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={sh.btnPrimaryTxt}>Create channel</Text>}
        </TouchableOpacity>
      </View>
    </SheetShell>
  );
}


export function DocDetailSheet() {
  const { state, dispatch } = useStore();
  const visible = state.modal?.kind === 'doc';
  const doc = state.modal?.kind === 'doc' ? state.modal.doc : null;

  if (!doc) return null;

  const creatorProfile = Object.values(state.profiles).find(p => p && p.id === doc.createdBy);
  const creatorSlot = creatorProfile ? creatorProfile.shortId : null;

  return (
    <SheetShell visible={visible} onClose={() => dispatch({ t: 'closeModal' })}>
      <View style={[S.between, { marginBottom: 14 }]}>
        <Text style={sh.monoSm}>DOCUMENT VIEW</Text>
        <TouchableOpacity onPress={() => dispatch({ t: 'closeModal' })} style={sh.closeBtn}>
          <Icon name="x" size={14} />
        </TouchableOpacity>
      </View>

      <Text style={sh.sheetH}>{doc.title}</Text>

      <View style={[S.row, { gap: 6, marginVertical: 8 }]}>
        {creatorProfile && creatorSlot && (
          <View style={[S.row, { gap: 4 }]}>
            <Text style={{ fontSize: 10, color: colors.fg5, fontFamily: 'Courier', fontWeight: '800' }}>BY</Text>
            <UserChip id={creatorSlot} size="sm" />
            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.fg2 }}>
              {creatorProfile.displayName}
            </Text>
          </View>
        )}
        <Text style={{ fontSize: 10, color: colors.fg6 }}>·</Text>
        <Text style={{ fontSize: 11, color: colors.fg5 }}>
          Updated {new Date(doc.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </Text>
      </View>

      <ScrollView style={{ flex: 1, marginVertical: 10 }} showsVerticalScrollIndicator={false}>
        {/* Rendered markdown content */}
        <View style={{ paddingBottom: 8 }}>
          {parseMarkdown(doc.content, { fontSize: 14.5, lineHeight: 22, color: colors.fg2 })}
        </View>

        {doc.tags && doc.tags.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 16 }}>
            {doc.tags.map(t => (
              <View key={t} style={{ borderWidth: 1, borderColor: colors.border12, backgroundColor: colors.bgTint04, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: colors.fg4 }}>#{t.toUpperCase()}</Text>
              </View>
            ))}
          </View>
        )}

        {doc.attachments && doc.attachments.length > 0 && (
          <View style={{ marginTop: 20 }}>
            <Text style={[sh.monoSm, { fontSize: 9, marginBottom: 8 }]}>ATTACHED FILES ({doc.attachments.length})</Text>
            <View style={{ gap: 6 }}>
              {doc.attachments.map((att, idx) => (
                <TouchableOpacity
                  key={idx}
                  onPress={() => {
                    import('react-native').then(rn => {
                      rn.Linking.openURL(att.uri).catch(() => {});
                    });
                  }}
                  style={[S.row, { padding: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border12, backgroundColor: colors.bgTint02, gap: 8 }]}
                >
                  <Icon name="note" size={14} color={colors.fg4} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12.5, fontWeight: '600', color: colors.fg1 }} numberOfLines={1}>{att.name}</Text>
                    <Text style={{ fontSize: 10, color: colors.fg5 }}>{att.size ? `${Math.round(att.size / 1024)} KB` : 'Attachment'}</Text>
                  </View>
                  <Icon name="chev" size={12} color={colors.fg6} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <TouchableOpacity style={[sh.btnPrimary, { marginTop: 14 }]} onPress={() => dispatch({ t: 'closeModal' })}>
        <Text style={sh.btnPrimaryTxt}>DONE READING</Text>
      </TouchableOpacity>
    </SheetShell>
  );
}


const sh = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 0, maxHeight: '92%' },
  grab: { width: 40, height: 4, backgroundColor: colors.bgTint06, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  sheetH: { fontWeight: '900', fontSize: 26, lineHeight: 32, letterSpacing: -0.7, color: colors.fg1 },
  monoSm: { fontFamily: 'Courier', fontSize: 10, textTransform: 'uppercase', letterSpacing: 2.2, color: colors.fg5 } as any,
  closeBtn: { width: 28, height: 28, borderRadius: 10, backgroundColor: colors.bgTint04, borderWidth: 1, borderColor: colors.border08, alignItems: 'center', justifyContent: 'center' },
  field: { borderWidth: 1, borderColor: colors.border12, borderRadius: 14, padding: 12, backgroundColor: '#fff', gap: 4 },
  fieldLabel: { fontFamily: 'Courier', fontSize: 9, textTransform: 'uppercase', letterSpacing: 2.2, color: colors.fg6 } as any,
  fieldInput: { fontSize: 15, fontWeight: '500', color: colors.fg1, paddingVertical: 0, paddingHorizontal: 0 },
  infoCard: { borderWidth: 1, borderColor: colors.border08, borderRadius: 18, padding: 14 },
  tagWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 22, paddingHorizontal: 9, borderWidth: 1, borderColor: colors.border12, backgroundColor: colors.bgTint04, borderRadius: 9999 } as any,
  tagText: { fontFamily: 'Courier', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5, color: colors.fg4 } as any,
  btnPrimary: { flex: 1, height: 44, backgroundColor: colors.foreground, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnOutline: { flex: 1, height: 44, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border15, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnOutlineTxt: { fontWeight: '600', fontSize: 14, color: colors.fg1 },
});
