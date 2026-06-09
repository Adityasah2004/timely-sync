import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useStore, toggleTodoItem } from '../../lib/store';
import { colors } from '../../lib/tokens';
import { toMins, fmtClock, fmtHM } from '../../lib/utils';
import { USER_LIST } from '../../data/seed';

function useName(shortId: string, profiles: import('../../lib/store').ProfileMap): string {
  if (shortId === 'B') return 'Both';
  return profiles[shortId as import('../../lib/types').UserId]?.displayName ?? 'N/A';
}
import {
  ScreenHeader, CardInv, CardAlt, Card, SecLabel, EventRow, UserChip,
  UserStripe, AppSwitch, styles, Divider,
} from '../../components/Primitives';
import { Icon } from '../../components/Icon';

export function TodayScreen() {
  const { state, dispatch } = useStore();
  const now = state.clock;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const viewer = state.viewer;
  const myName = useName(viewer, state.profiles);

  // All slots that have a real profile in this household
  const activeSlots = USER_LIST.filter(u => state.profiles[u]);

  // Utility to format Date to YYYY-MM-DD
  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const todayISO = fmt(now);
  
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(now.getDate() + 1);
  const tomorrowISO = fmt(tomorrowDate);

  const events = state.events;
  const visible = events.filter(e => !(e.priv && e.who !== 'B' && e.who !== viewer));
  
  // NOW card matches strictly today's date
  const current = visible.find(e => e.day === todayISO && toMins(e.start) <= nowMin && toMins(e.end) > nowMin);
  const nextToday = visible.filter(e => e.day === todayISO && toMins(e.start) > nowMin).sort((a, b) => toMins(a.start) - toMins(b.start));
  const next = nextToday[0] || null;

  // Up Next grouping
  const todayEvents = visible.filter(e => e.day === todayISO && toMins(e.end) > nowMin).sort((a, b) => toMins(a.start) - toMins(b.start));
  const tomorrowEvents = visible.filter(e => e.day === tomorrowISO).sort((a, b) => toMins(a.start) - toMins(b.start));
  const laterEvents = visible.filter(e => e.day && e.day > tomorrowISO).sort((a, b) => {
    if (a.day !== b.day) return a.day!.localeCompare(b.day!);
    return toMins(a.start) - toMins(b.start);
  });

  const totalUpcomingCount = todayEvents.length + tomorrowEvents.length + laterEvents.length;

  const todayTotal = visible.filter(e => e.day === todayISO);
  const todayDoneCount = todayTotal.length - todayEvents.length;

  const sharedTodos = state.todos.filter(t => t.shared);
  const openShared = sharedTodos.filter(t => !t.done);

  const dayPct = Math.min(100, Math.max(0, ((nowMin - 6 * 60) / (22 * 60 - 6 * 60)) * 100));

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 18, paddingBottom: 130 }}>
      <ScreenHeader
        eyebrow={`TIMELY · ${myName.toUpperCase()}'S PHONE`}
        title="Hi,"
        ghost={`${myName}.`}
        sub={`${openShared.length} shared task${openShared.length === 1 ? '' : 's'} open. ${todayDoneCount}/${todayTotal.length} done today.`}
      />

      {/* NOW card */}
      <CardInv style={{ marginBottom: 18 }}>
        <View style={[styles.between, { marginBottom: 14 }]}>
          <Text style={{ fontFamily: 'Courier', fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, color: colors.fgInv4 }}>NOW · LIVE</Text>
          <Text style={{ fontFamily: 'Courier', fontSize: 13, color: colors.fgInv2 }}>{fmtClock(now)}</Text>
        </View>

        {current ? (
          <>
            <View style={[styles.row, { gap: 12, marginBottom: 4 }]}>
              <UserChip id={current.who} />
              <Text style={{ fontFamily: 'Courier', fontSize: 9, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.fgInv4 }}>
                {current.start}—{current.end}
              </Text>
              {current.priv && (
                <View style={[styles.row, { gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colors.borderInv15, borderRadius: 9999 }]}>
                  <Icon name="lock" size={10} color={colors.fgInv2} />
                  <Text style={{ fontFamily: 'Courier', fontSize: 9, color: colors.fgInv2, textTransform: 'uppercase' }}>PRIVATE</Text>
                </View>
              )}
            </View>
            <Text style={{ fontWeight: '900', fontSize: 30, lineHeight: 34, letterSpacing: -1, color: '#fff', marginTop: 6 }}>
              {current.title}
            </Text>
            <Text style={{ fontFamily: 'Courier', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.6, color: colors.fgInv4, marginTop: 8 }}>
              {current.loc.toUpperCase()} · {current.who === 'B' ? 'TOGETHER' : useName(current.who, state.profiles).toUpperCase()}
            </Text>
          </>
        ) : (
          <>
            <Text style={{ fontWeight: '900', fontSize: 32, lineHeight: 36, letterSpacing: -1, color: '#fff' }}>
              Free until <Text style={{ color: colors.fgInv4 }}>{next ? next.start : '—'}</Text>
            </Text>
            <Text style={{ fontFamily: 'Courier', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.6, color: colors.fgInv4, marginTop: 10 }}>
              {next ? `NEXT · ${next.title.toUpperCase()}` : 'NO MORE EVENTS TODAY'}
            </Text>
          </>
        )}

        {/* Day progress */}
        <View style={{ marginTop: 22, height: 1, backgroundColor: colors.borderInv15 }}>
          <View style={{ position: 'absolute', top: -2, left: 0, width: `${dayPct}%`, height: 5, backgroundColor: '#fff', borderRadius: 2 }} />
        </View>
        <View style={[styles.between, { marginTop: 8 }]}>
          <Text style={{ fontFamily: 'Courier', fontSize: 9, color: colors.fgInv5 }}>06:00</Text>
          <Text style={{ fontFamily: 'Courier', fontSize: 9, color: colors.fgInv5 }}>22:00</Text>
        </View>
      </CardInv>

      {/* Members strip — scrollable for 3+ people, full-width flex-split for 2 people */}
      {(() => {
        const isScrollable = activeSlots.length > 2;
        const membersContent = activeSlots.map(uid => {
          const memberCurrent = events.find(e => (e.who === uid || e.who === 'B') && toMins(e.start) <= nowMin && toMins(e.end) > nowMin);
          const memberNext = events.find(e => (e.who === uid || e.who === 'B') && toMins(e.start) > nowMin);
          const hidden = memberCurrent && memberCurrent.priv && memberCurrent.who !== 'B' && memberCurrent.who !== viewer;
          const isMe = uid === viewer;
          return (
            <Card key={uid} style={{
              ...(isScrollable ? { width: 150 } : { flex: 1 }),
              padding: 14
            }}>
              <View style={[styles.row, { gap: 8, marginBottom: 8 }]}>
                <UserChip id={uid} size="lg" />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'Courier', fontSize: 9, letterSpacing: 1.8, textTransform: 'uppercase', color: colors.fg5 }}>{isMe ? 'YOU' : useName(uid, state.profiles).toUpperCase()}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', letterSpacing: -0.2 }} numberOfLines={1}>{useName(uid, state.profiles)}</Text>
                </View>
              </View>
              {memberCurrent ? (
                <>
                  <Text style={{ fontSize: 13, fontWeight: '600', letterSpacing: -0.1 }} numberOfLines={1}>{hidden ? 'Private · busy' : memberCurrent.title}</Text>
                  <Text style={{ fontFamily: 'Courier', fontSize: 9, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.fg5, marginTop: 3 }}>TILL {memberCurrent.end}</Text>
                </>
              ) : memberNext ? (
                <>
                  <Text style={{ fontSize: 13, fontWeight: '600' }} numberOfLines={1}>Free</Text>
                  <Text style={{ fontFamily: 'Courier', fontSize: 9, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.fg5, marginTop: 3 }}>NEXT {memberNext.start}</Text>
                </>
              ) : (
                <>
                  <Text style={{ fontSize: 13, fontWeight: '600' }} numberOfLines={1}>Free</Text>
                  <Text style={{ fontFamily: 'Courier', fontSize: 9, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.fg5, marginTop: 3 }}>WRAPPED</Text>
                </>
              )}
            </Card>
          );
        });

        if (isScrollable) {
          return (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 22 }} contentContainerStyle={{ gap: 12 }}>
              {membersContent}
            </ScrollView>
          );
        }

        return (
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 22 }}>
            {membersContent}
          </View>
        );
      })()}

      {/* Up next */}
      <SecLabel count={totalUpcomingCount} right={
        <TouchableOpacity style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.bgTint04, borderWidth: 1, borderColor: colors.border08 }}
          onPress={() => dispatch({ t: 'tab', tab: 'plan' })}>
          <Icon name="chev" size={12} />
        </TouchableOpacity>
      }>Up next</SecLabel>
      <View style={{ gap: 14, marginBottom: 24 }}>
        {/* Today Events */}
        {todayEvents.length > 0 && (
          <View style={{ gap: 6 }}>
            <Text style={{ fontFamily: 'Courier', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.8, color: colors.fg5, paddingLeft: 4 }}>Today</Text>
            {todayEvents.slice(0, 3).map(ev => (
              <EventRow key={ev.id} ev={ev} viewer={viewer} onPress={() => dispatch({ t: 'openEvent', ev })} />
            ))}
          </View>
        )}

        {/* Tomorrow Events */}
        {tomorrowEvents.length > 0 && (
          <View style={{ gap: 6 }}>
            <Text style={{ fontFamily: 'Courier', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.8, color: colors.fg5, paddingLeft: 4 }}>Tomorrow</Text>
            {tomorrowEvents.slice(0, 3).map(ev => (
              <EventRow key={ev.id} ev={ev} viewer={viewer} onPress={() => dispatch({ t: 'openEvent', ev })} />
            ))}
          </View>
        )}

        {/* Later Events */}
        {laterEvents.length > 0 && (
          <View style={{ gap: 6 }}>
            <Text style={{ fontFamily: 'Courier', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.8, color: colors.fg5, paddingLeft: 4 }}>Later</Text>
            {laterEvents.slice(0, 3).map(ev => (
              <EventRow key={ev.id} ev={ev} viewer={viewer} onPress={() => dispatch({ t: 'openEvent', ev })} />
            ))}
          </View>
        )}

        {totalUpcomingCount === 0 && (
          <CardAlt style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ fontSize: 11, color: colors.fg6, fontFamily: 'Courier', textTransform: 'uppercase', letterSpacing: 1 }}>No upcoming events</Text>
          </CardAlt>
        )}
      </View>

      {/* Shared to-dos */}
      <SecLabel count={openShared.length} right={
        <TouchableOpacity style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.bgTint04, borderWidth: 1, borderColor: colors.border08 }}
          onPress={() => dispatch({ t: 'tab', tab: 'todos' })}>
          <Icon name="chev" size={12} />
        </TouchableOpacity>
      }>Shared to-dos</SecLabel>
      <View style={{ marginBottom: 24 }}>
        {sharedTodos.length === 0 ? (
          <CardAlt style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ fontSize: 11, color: colors.fg6, fontFamily: 'Courier', textTransform: 'uppercase', letterSpacing: 1 }}>No shared to-dos</Text>
          </CardAlt>
        ) : (
          <Card style={{ padding: 4 }}>
            {sharedTodos.slice(0, 4).map((td, i, arr) => (
              <View key={td.id}
                style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: colors.border06 }}>
                {/* Checkbox Touch Target */}
                <TouchableOpacity onPress={() => toggleTodoItem(td, state, dispatch)}
                  style={{ paddingVertical: 12, paddingRight: 6 }}>
                  <View style={{ width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, borderColor: td.done ? colors.foreground : colors.border20, backgroundColor: td.done ? colors.foreground : '#fff', alignItems: 'center', justifyContent: 'center' }}>
                    {td.done && <Icon name="check" size={11} color="#fff" strokeWidth={2.4} />}
                  </View>
                </TouchableOpacity>

                {/* Details Touch Target */}
                <TouchableOpacity onPress={() => dispatch({ t: 'openTodoDetail', todo: td })}
                  style={{ flex: 1, flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 12, paddingLeft: 6 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13.5, fontWeight: '500', letterSpacing: -0.1, textDecorationLine: td.done ? 'line-through' : 'none', color: td.done ? colors.fg6 : colors.fg1 }} numberOfLines={1}>{td.text}</Text>
                    <Text style={{ fontFamily: 'Courier', fontSize: 9, letterSpacing: 1.8, textTransform: 'uppercase', color: colors.fg5, marginTop: 3 }}>DUE {td.due}</Text>
                  </View>
                  {td.assignedTo && td.assignedTo.length > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={{ fontFamily: 'Courier', fontSize: 7, color: colors.fg5 }}>TO</Text>
                      <View style={{ flexDirection: 'row' }}>
                        {td.assignedTo.map((uid, idx) => (
                          <View key={uid} style={{ marginLeft: idx > 0 ? -6 : 0, zIndex: 10 - idx }}>
                            <UserChip id={uid} />
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            ))}
          </Card>
        )}
      </View>

      {/* Activity feed */}
      <SecLabel count={state.activity.length}>Activity</SecLabel>
      <View style={{ marginBottom: 24 }}>
        {state.activity.length === 0 ? (
          <CardAlt style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ fontSize: 11, color: colors.fg6, fontFamily: 'Courier', textTransform: 'uppercase', letterSpacing: 1 }}>No activity yet</Text>
          </CardAlt>
        ) : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {state.activity.slice(0, 6).map((a, i) => (
              <View key={i} style={[styles.row, { padding: 14, gap: 12, alignItems: 'flex-start', borderBottomWidth: i < 5 ? 1 : 0, borderBottomColor: colors.border06 }]}>
                <UserChip id={a.who} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, lineHeight: 18, color: colors.fg2 }}>
                    <Text style={{ fontWeight: '700', color: colors.fg1 }}>{a.who === 'B' ? 'You both' : useName(a.who, state.profiles)}</Text>
                    {' '}{a.verb}{' '}
                    <Text style={{ color: colors.fg1, fontWeight: '500' }}>{a.obj}</Text>
                  </Text>
                  <Text style={{ fontFamily: 'Courier', fontSize: 9, letterSpacing: 1.8, textTransform: 'uppercase', color: colors.fg5, marginTop: 4 }}>{a.t} · {a.badge}</Text>
                </View>
              </View>
            ))}
          </Card>
        )}
      </View>

      {/* Startup Docs quick-start */}
      <CardAlt>
        <View style={[styles.between, { marginBottom: 10 }]}>
          <Text style={{ fontFamily: 'Courier', fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, color: colors.fg5 }}>STARTUP SPEC & WIKI</Text>
          <View style={styles.row}>
            {activeSlots.map((u, i) => (
              <View key={u} style={{ marginLeft: i > 0 ? -6 : 0 }}><UserChip id={u} /></View>
            ))}
          </View>
        </View>
        <Text style={{ fontWeight: '900', fontSize: 22, lineHeight: 26, letterSpacing: -0.6 }}>
          Align the founders.{' '}
          <Text style={{ color: colors.fg9 }}>PRDs, pitches & metrics.</Text>
        </Text>
        <View style={[styles.row, { gap: 8, marginTop: 14 }]}>
          <TouchableOpacity style={{ flex: 1, height: 44, backgroundColor: colors.foreground, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
            onPress={() => dispatch({ t: 'tab', tab: 'docs' })}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Open Specs</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ height: 44, paddingHorizontal: 18, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: colors.border15, alignItems: 'center', justifyContent: 'center' }}
            onPress={() => dispatch({ t: 'tab', tab: 'docs' })}>
            <Text style={{ fontWeight: '600', fontSize: 14 }}>Browse</Text>
          </TouchableOpacity>
        </View>
      </CardAlt>
    </ScrollView>
  );
}
