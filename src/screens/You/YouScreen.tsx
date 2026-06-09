import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Alert, Modal, TextInput,
  Share, Platform, ToastAndroid, NativeModules, Image, ActivityIndicator, StyleSheet,
} from 'react-native';

import * as Clipboard from 'expo-clipboard';
import { useStore } from '../../lib/store';
import { supabase } from '../../lib/supabase';
import { colors } from '../../lib/tokens';
import { USER_LIST } from '../../data/seed';
import QRCode from 'react-native-qrcode-svg';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as ImagePicker from 'expo-image-picker';
import { ScreenHeader, CardInv, CardAlt, Card, SecLabel, UserChip, styles } from '../../components/Primitives';
import { Icon } from '../../components/Icon';
import type { IconName } from '../../components/Icon';
import type { UserId } from '../../lib/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function useName(id: string, profiles: import('../../lib/store').ProfileMap): string {
  return profiles[id as UserId]?.displayName ?? 'N/A';
}

async function pickAndUploadAvatar(
  bucket: string,
  path: string,
  onSuccess: (url: string) => void,
  onError: (msg: string) => void,
  onCancel: () => void,
) {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') { onError('Gallery permission denied'); return; }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });
  // User closed picker without choosing — stop loading
  if (result.canceled || !result.assets?.[0]?.uri) { onCancel(); return; }

  const uri = result.assets[0].uri;
  // Strip query strings before extracting extension, default to jpeg
  const rawExt = uri.split('?')[0].split('.').pop()?.toLowerCase() ?? 'jpeg';
  const ext = ['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(rawExt) ? rawExt : 'jpeg';
  const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  const filePath = `${path}.${ext}`;

  // Read as base64
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const arrayBuffer = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

  const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, arrayBuffer, {
    contentType: mimeType,
    upsert: true,
  });

  if (uploadError) { onError(uploadError.message); return; }

  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
  onSuccess(data.publicUrl + `?t=${Date.now()}`);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EditModal({ visible, title, value, onSave, onClose }: {
  visible: boolean; title: string; value: string; onSave: (v: string) => void; onClose: () => void;
}) {
  const [text, setText] = useState(value);
  React.useEffect(() => { if (visible) setText(value); }, [visible, value]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 28 }} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 24 }}>
            <Text style={{ fontFamily: 'Courier', fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, color: colors.fg5, marginBottom: 12 }}>{title}</Text>
            <TextInput
              value={text}
              onChangeText={setText}
              autoFocus
              style={{ height: 48, borderWidth: 1, borderColor: colors.border12, borderRadius: 12, paddingHorizontal: 14, fontSize: 15, color: colors.fg1 }}
            />
            <View style={[styles.row, { gap: 10, marginTop: 18 }]}>
              <TouchableOpacity onPress={onClose} style={{ flex: 1, height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border12, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 14, color: colors.fg3 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { onSave(text); onClose(); }} style={{ flex: 1, height: 44, borderRadius: 12, backgroundColor: colors.foreground, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function PickerModal({ visible, title, options, selected, onSave, onClose }: {
  visible: boolean; title: string; options: string[]; selected: string; onSave: (v: string) => void; onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 28 }} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 24 }}>
            <Text style={{ fontFamily: 'Courier', fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, color: colors.fg5, marginBottom: 16 }}>{title}</Text>
            {options.map((opt, i) => (
              <TouchableOpacity key={opt} onPress={() => { onSave(opt); onClose(); }}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14,
                  borderBottomWidth: i < options.length - 1 ? 1 : 0, borderBottomColor: colors.border06 }}>
                <Text style={{ fontSize: 15, color: colors.fg1 }}>{opt}</Text>
                {opt === selected && <Icon name="check" size={14} color={colors.foreground} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function SettingsRow({ label, value, icon, danger, last, onPress }: {
  label: string; value?: string; icon: IconName; danger?: boolean; last?: boolean; onPress?: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} disabled={!onPress}
      style={[styles.row, { padding: 14, paddingHorizontal: 16, gap: 14, alignItems: 'center', borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border06 }]}>
      <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: danger ? '#FEF2F2' : colors.bgTint04, borderWidth: 1, borderColor: danger ? '#FCA5A5' : colors.border08, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={14} color={danger ? '#B91C1C' : colors.fg2} />
      </View>
      <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '500', letterSpacing: -0.1, color: danger ? '#B91C1C' : colors.fg1 }}>{label}</Text>
      {value ? <Text style={{ fontFamily: 'Courier', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.6, color: colors.fg5 }}>{value}</Text> : null}
      {onPress && <Icon name="chev" size={14} color={colors.fg7} />}
    </TouchableOpacity>
  );
}

// ─── Avatar circle ────────────────────────────────────────────────────────────
// Camera icon is always centred below the avatar as a separate pill button,
// so nothing gets clipped by the overflow:hidden on the circle itself.

function AvatarCircle({
  size, initial, avatarUrl, onPress, uploading, inv,
}: {
  size: number; initial: string; avatarUrl?: string | null;
  onPress?: () => void; uploading?: boolean; inv?: boolean;
}) {
  const bg = inv ? 'rgba(255,255,255,0.15)' : colors.bgTint06;
  const border = inv ? 'rgba(255,255,255,0.3)' : colors.border12;
  const r = size / 2;

  return (
    <View style={{ alignItems: 'center' }}>
      <TouchableOpacity
        onPress={onPress}
        disabled={!onPress || uploading}
        activeOpacity={0.8}
        style={{ width: size, height: size, borderRadius: r, overflow: 'hidden', borderWidth: 2, borderColor: border }}
      >
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={{ width: size, height: size }} />
        ) : (
          <View style={{ flex: 1, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: size * 0.36, fontWeight: '800', color: inv ? '#fff' : colors.fg2, letterSpacing: -0.5 }}>
              {initial}
            </Text>
          </View>
        )}
        {uploading && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#fff" />
          </View>
        )}
      </TouchableOpacity>
      {/* Camera badge sits BELOW the circle, never clipped */}
      {onPress && !uploading && (
        <TouchableOpacity
          onPress={onPress}
          activeOpacity={0.85}
          style={{
            marginTop: 8,
            flexDirection: 'row', alignItems: 'center', gap: 5,
            paddingHorizontal: 10, paddingVertical: 5,
            borderRadius: 99,
            backgroundColor: inv ? 'rgba(255,255,255,0.18)' : colors.bgTint06,
            borderWidth: 1,
            borderColor: inv ? 'rgba(255,255,255,0.25)' : colors.border12,
          }}
        >
          <Icon name="camera" size={11} color={inv ? '#fff' : colors.fg3} />
          <Text style={{ fontFamily: 'Courier', fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2, color: inv ? 'rgba(255,255,255,0.7)' : colors.fg4 }}>
            Change
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Workspace Dropdown ────────────────────────────────────────────────────────

function WorkspaceDropdown() {
  const { state, dispatch } = useStore();
  const [open, setOpen] = useState(false);

  const currentName = state.householdName ?? state.userHouseholds.find(h => h.id === state.householdId)?.name ?? 'My Household';

  async function switchTo(hId: string) {
    setOpen(false);
    if (hId === state.householdId) return;
    await supabase.from('profiles').update({ active_household_id: hId }).eq('id', state.userId!);
    dispatch({ t: 'setHousehold', householdId: hId });
  }

  return (
    <>
      {/* Full-width trigger button */}
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 12,
          height: 52, paddingHorizontal: 16, borderRadius: 14,
          backgroundColor: colors.bgTint04, borderWidth: 1, borderColor: colors.border08,
          marginBottom: 22,
        }}
      >
        {/* Household avatar or initial */}
        {state.householdAvatar ? (
          <Image source={{ uri: state.householdAvatar }} style={{ width: 32, height: 32, borderRadius: 9, borderWidth: 1, borderColor: colors.border08 }} />
        ) : (
          <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: colors.foreground, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontWeight: '800', fontSize: 13, color: '#fff' }}>
              {(currentName[0] ?? 'H').toUpperCase()}
            </Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.fg1, letterSpacing: -0.3 }} numberOfLines={1}>{currentName}</Text>
          <Text style={{ fontFamily: 'Courier', fontSize: 8, textTransform: 'uppercase', letterSpacing: 1.4, color: colors.fg5 }}>
            {state.userHouseholds.length} WORKSPACE{state.userHouseholds.length !== 1 ? 'S' : ''} · TAP TO SWITCH
          </Text>
        </View>
        <Icon name="chevDown" size={16} color={colors.fg4} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end', padding: 16 }} activeOpacity={1} onPress={() => setOpen(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={{ backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden' }}>
              <View style={{ padding: 20, paddingBottom: 12 }}>
                <Text style={{ fontFamily: 'Courier', fontSize: 9, textTransform: 'uppercase', letterSpacing: 2, color: colors.fg5 }}>Switch Workspace</Text>
              </View>
              {state.userHouseholds.map((h, i) => {
                const active = h.id === state.householdId;
                const initial = (h.name?.[0] ?? 'H').toUpperCase();
                return (
                  <TouchableOpacity key={h.id} onPress={() => switchTo(h.id)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 14,
                      borderTopWidth: i === 0 ? 1 : 0, borderBottomWidth: 1, borderColor: colors.border06,
                      backgroundColor: active ? colors.bgTint02 : '#fff',
                    }}>
                    {h.avatarUrl ? (
                      <Image source={{ uri: h.avatarUrl }} style={{ width: 36, height: 36, borderRadius: 10, borderWidth: 1, borderColor: colors.border08 }} />
                    ) : (
                      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: active ? colors.foreground : colors.bgTint06, borderWidth: 1, borderColor: active ? colors.foreground : colors.border08, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontWeight: '800', fontSize: 14, color: active ? '#fff' : colors.fg3 }}>{initial}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.fg1, letterSpacing: -0.2 }}>{h.name}</Text>
                      {active && <Text style={{ fontFamily: 'Courier', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.4, color: colors.fg5, marginTop: 2 }}>Active</Text>}
                    </View>
                    {active && <Icon name="check" size={14} color={colors.foreground} />}
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                onPress={() => {
                  setOpen(false);
                  supabase.from('profiles').update({ active_household_id: null }).eq('id', state.userId!);
                  dispatch({ t: 'setHousehold', householdId: null });
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 16 }}
              >
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.bgTint04, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border20, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="plus" size={16} color={colors.fg4} />
                </View>
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.fg3 }}>Add or join a household</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function YouScreen() {
  const { state, dispatch } = useStore();

  // mySlot is the real authenticated user's slot — never changes with "view as"
  const mySlot = state.mySlot ?? '1';
  const isAdmin = mySlot === '1';

  const myProfile = state.profiles[mySlot as UserId];
  const myName = myProfile?.displayName ?? 'N/A';

  const housemates = USER_LIST.filter(u => u !== mySlot && state.profiles[u]);
  const myEvents = state.events.filter(e => e.who === mySlot || e.who === 'B').length;
  const openTodosCount = state.todos.filter(t => (t.assignedTo ? t.assignedTo.includes(mySlot) : t.who === mySlot) && !t.done).length;
  const totalDocsCount = state.docs.length;
  const sharedEvents = state.events.filter(e => e.who === 'B').length;

  const prefs = myProfile?.preferences as Record<string, string> | undefined ?? {};
  const [defaultShare, setDefaultShare] = useState<string>(prefs.defaultShare ?? 'Shared');
  const [privateAs,    setPrivateAs]    = useState<string>(prefs.privateAs ?? 'Busy · no details');
  const [defaultTodoView, setDefaultTodoView] = useState<string>(prefs.defaultTodoView ?? 'List');
  const [taskNotifications, setTaskNotifications] = useState<string>(prefs.taskNotifications ?? 'All Activity');
  const [bedtime,      setBedtime]      = useState<string>(prefs.bedtime ?? '23:00 → 06:00');
  const appearance = prefs.appearance ?? 'Light';

  const [showQr, setShowQr] = useState(false);
  const qrRef = React.useRef<any>(null);

  // Edit modals
  const [modal, setModal] = useState<string | null>(null);
  const [editTaglineVisible, setEditTaglineVisible] = useState(false);
  const [editRoleVisible, setEditRoleVisible] = useState(false);
  const [editHouseNameVisible, setEditHouseNameVisible] = useState(false);

  // Upload states
  const [uploadingUserAvatar, setUploadingUserAvatar] = useState(false);
  const [uploadingHouseAvatar, setUploadingHouseAvatar] = useState(false);

  async function savePref(key: string, value: string) {
    if (!state.userId) return;
    const next = { ...prefs, [key]: value };
    await supabase.from('profiles').update({ preferences: next }).eq('id', state.userId);
    dispatch({ t: 'setProfiles', profiles: { ...state.profiles, [mySlot as UserId]: { ...myProfile!, preferences: next } } });
  }

  async function saveTagline(v: string) {
    if (!state.userId || !state.householdId) return;
    await supabase.from('household_members').update({ tagline: v }).eq('user_id', state.userId).eq('household_id', state.householdId);
    dispatch({ t: 'setProfiles', profiles: { ...state.profiles, [mySlot as UserId]: { ...myProfile!, tagline: v } } });
  }

  async function saveRole(v: string) {
    if (!state.userId || !state.householdId) return;
    await supabase.from('household_members').update({ role_label: v }).eq('user_id', state.userId).eq('household_id', state.householdId);
    dispatch({ t: 'setProfiles', profiles: { ...state.profiles, [mySlot as UserId]: { ...myProfile!, roleLabel: v } } });
  }

  async function saveHouseholdName(v: string) {
    if (!state.householdId) return;
    await supabase.from('households').update({ name: v }).eq('id', state.householdId);
    dispatch({ t: 'setHouseholdMeta', name: v, avatarUrl: state.householdAvatar });
  }

  async function handleUserAvatarUpload() {
    if (!state.userId) return;
    setUploadingUserAvatar(true);
    await pickAndUploadAvatar(
      'avatars',
      `${state.userId}/avatar`,
      async (url) => {
        await supabase.from('profiles').update({ avatar_url: url }).eq('id', state.userId!);
        dispatch({ t: 'setProfiles', profiles: { ...state.profiles, [mySlot as UserId]: { ...myProfile!, avatarUrl: url } } });
        setUploadingUserAvatar(false);
      },
      (err) => { Alert.alert('Upload failed', err); setUploadingUserAvatar(false); },
      () => setUploadingUserAvatar(false),   // cancelled — stop spinner
    );
  }

  async function handleHouseAvatarUpload() {
    if (!state.householdId || !isAdmin) return;
    setUploadingHouseAvatar(true);
    await pickAndUploadAvatar(
      'avatars',
      `${state.userId}/household-${state.householdId}`,
      async (url) => {
        await supabase.from('households').update({ avatar_url: url }).eq('id', state.householdId!);
        dispatch({ t: 'setHouseholdMeta', name: state.householdName, avatarUrl: url });
        setUploadingHouseAvatar(false);
      },
      (err) => { Alert.alert('Upload failed', err); setUploadingHouseAvatar(false); },
      () => setUploadingHouseAvatar(false),   // cancelled — stop spinner
    );
  }

  async function copyHouseholdId() {
    if (!state.householdId) return;
    const messageText = `Join my Timely household!\n\nScan the QR code in the app to join, or enter this Household ID manually:\n${state.householdId}`;
    await Clipboard.setStringAsync(messageText);
    Alert.alert('Copied!', 'Household invite message copied to clipboard.');
  }

  async function shareHousehold() {
    const householdId = state.householdId;
    if (!householdId) return;
    const messageText = `Join my Timely household!\n\nScan the QR code in the app to join, or enter this Household ID manually:\n${householdId}`;
    if (!qrRef.current) {
      await Clipboard.setStringAsync(messageText);
      try { await Share.share({ message: messageText }); } catch (err: any) { Alert.alert('Error', err.message); }
      return;
    }
    qrRef.current.toDataURL(async (dataURL: string) => {
      try {
        try {
          if (NativeModules.RNShare) {
            const RNShareModule = require('react-native-share');
            const RNShare = RNShareModule.default || RNShareModule;
            await RNShare.open({ title: 'Share Household Invite', message: messageText, url: `data:image/png;base64,${dataURL}`, type: 'image/png', useInternalStorage: true });
            return;
          }
        } catch (shareErr) {
          if (String(shareErr).includes('User did not share') || String(shareErr).includes('cancelled')) return;
        }
        await Clipboard.setStringAsync(messageText);
        if (Platform.OS === 'android') ToastAndroid.show('Invite message copied!', ToastAndroid.SHORT);
        const path = `${FileSystem.cacheDirectory}timely_invite_qr.png`;
        await FileSystem.writeAsStringAsync(path, dataURL, { encoding: FileSystem.EncodingType.Base64 });
        if (Platform.OS === 'ios') {
          await Share.share({ message: messageText, url: path });
        } else {
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(path, { dialogTitle: 'Share Household QR Code', mimeType: 'image/png' });
          } else {
            await Share.share({ message: messageText });
          }
        }
      } catch (err: any) { Alert.alert('Sharing Error', err.message); }
    });
  }

  async function removeMember(memberId: string | undefined, name: string) {
    if (!memberId || !state.householdId) return;
    Alert.alert('Remove Member', `Are you sure you want to remove ${name} from this household?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('household_members').delete()
            .eq('user_id', memberId).eq('household_id', state.householdId);
          if (error) { Alert.alert('Error', error.message); return; }
          const nextProfiles = { ...state.profiles } as any;
          const match = Object.entries(nextProfiles).find(([_, p]) => (p as any)?.id === memberId);
          if (match) { delete nextProfiles[match[0]]; dispatch({ t: 'setProfiles', profiles: nextProfiles }); }
        }
      }
    ]);
  }

  async function leaveHousehold() {
    if (!state.userId || !state.householdId) return;
    Alert.alert('Leave Household', 'Are you sure you want to leave this household?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave', style: 'destructive',
        onPress: async () => {
          const otherHousehold = state.userHouseholds.find(h => h.id !== state.householdId);
          const nextActiveId = otherHousehold ? otherHousehold.id : null;
          const { error: deleteError } = await supabase.from('household_members').delete()
            .eq('user_id', state.userId).eq('household_id', state.householdId);
          if (deleteError) { Alert.alert('Error', deleteError.message); return; }
          await supabase.from('profiles').update({ active_household_id: nextActiveId }).eq('id', state.userId!);
          dispatch({ t: 'setHousehold', householdId: nextActiveId });
        }
      }
    ]);
  }

  function signOut() {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out', style: 'destructive',
        onPress: async () => {
          // Clear active household so next sign-in shows the picker
          if (state.userId) {
            await supabase.from('profiles')
              .update({ active_household_id: null })
              .eq('id', state.userId);
          }
          await supabase.auth.signOut();
        },
      },
    ]);
  }

  const householdInitial = (state.householdName ?? 'H')[0].toUpperCase();

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 18, paddingBottom: 130 }}>
      <ScreenHeader
        eyebrow={`YOU · ${myName.toUpperCase()}`}
        title="Hi,"
        ghost={myName + '.'}
        sub="Two calendars, one home. Make it yours."
      />

      {/* Workspace Switcher Dropdown */}
      {state.userHouseholds.length >= 1 && <WorkspaceDropdown />}

      {/* ── Household Header Card ── */}
      <SecLabel>The house · {housemates.length + 1}</SecLabel>
      <CardInv style={{ marginBottom: 20 }}>
        <View style={[styles.row, { gap: 16, alignItems: 'center', marginBottom: 16 }]}>
          <AvatarCircle
            size={64}
            initial={householdInitial}
            avatarUrl={state.householdAvatar}
            onPress={isAdmin ? handleHouseAvatarUpload : undefined}
            uploading={uploadingHouseAvatar}
            inv
          />
          <View style={{ flex: 1 }}>
            <TouchableOpacity onPress={isAdmin ? () => setEditHouseNameVisible(true) : undefined} activeOpacity={isAdmin ? 0.7 : 1}>
              <View style={[styles.row, { gap: 6, alignItems: 'center' }]}>
                <Text style={{ fontWeight: '900', fontSize: 22, letterSpacing: -0.8, color: '#fff' }} numberOfLines={1}>
                  {state.householdName ?? 'My Household'}
                </Text>
                {isAdmin && <Icon name="edit" size={13} color="rgba(255,255,255,0.4)" />}
              </View>
            </TouchableOpacity>
            <Text style={{ fontFamily: 'Courier', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.6, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
              {housemates.length + 1} MEMBER{housemates.length + 1 !== 1 ? 'S' : ''} · {sharedEvents} SHARED EVENTS
            </Text>
          </View>
        </View>

        {/* Member row */}
        <View style={{ flexDirection: 'row', gap: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, overflow: 'hidden' }}>
          {USER_LIST.filter(u => state.profiles[u]).map((u, i, arr) => {
            const p = state.profiles[u as UserId];
            return (
              <View key={u} style={{ flex: 1, backgroundColor: colors.foreground, paddingVertical: 12, alignItems: 'center', gap: 6 }}>
                <UserChip id={u as UserId} size="lg" />
                <Text style={{ fontFamily: 'Courier', fontSize: 8, textTransform: 'uppercase', letterSpacing: 1.2, color: 'rgba(255,255,255,0.5)', textAlign: 'center' }} numberOfLines={1}>
                  {p?.displayName?.split(' ')[0] ?? 'N/A'}
                </Text>
              </View>
            );
          })}
        </View>
      </CardInv>

      {/* ── My Profile Card ── */}
      <SecLabel>My profile</SecLabel>
      <CardInv style={{ marginBottom: 20 }}>
        <View style={[styles.row, { gap: 16, alignItems: 'center', marginBottom: 16 }]}>
          <AvatarCircle
            size={72}
            initial={myName[0]?.toUpperCase() ?? 'U'}
            avatarUrl={myProfile?.avatarUrl}
            onPress={handleUserAvatarUpload}
            uploading={uploadingUserAvatar}
            inv
          />
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '900', fontSize: 24, letterSpacing: -0.8, lineHeight: 28, color: '#fff' }}>{myName}</Text>
            <TouchableOpacity onPress={() => setEditRoleVisible(true)}>
              <Text style={{ fontFamily: 'Courier', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.6, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>
                {(myProfile?.roleLabel ?? '').toUpperCase() || 'TAP TO SET ROLE'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setEditTaglineVisible(true)}>
              <Text style={{ fontSize: 12, fontWeight: '300', color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
                "{myProfile?.tagline || 'tap to set tagline'}"
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats */}
        <View style={{ flexDirection: 'row', gap: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, overflow: 'hidden' }}>
          {[
            { v: String(openTodosCount), l: 'OPEN\nTASKS' },
            { v: String(myEvents),       l: 'EVENTS\nTHIS WK' },
            { v: String(totalDocsCount), l: 'WIKI\nDOCS' },
          ].map((s, i) => (
            <View key={i} style={{ flex: 1, backgroundColor: colors.foreground, paddingVertical: 14, alignItems: 'center' }}>
              <Text style={{ fontWeight: '900', fontSize: 22, letterSpacing: -0.8, lineHeight: 26, color: '#fff' }}>{s.v}</Text>
              <Text style={{ fontFamily: 'Courier', fontSize: 8, textTransform: 'uppercase', letterSpacing: 1.4, color: 'rgba(255,255,255,0.4)', marginTop: 6, textAlign: 'center', lineHeight: 12 }}>{s.l}</Text>
            </View>
          ))}
        </View>
      </CardInv>

      {/* ── Housemates ── */}
      {housemates.length > 0 && (
        <>
          <SecLabel>Housemates</SecLabel>
          {housemates.map((u, i) => {
            const p = state.profiles[u as UserId];
            return (
              <Card key={u} style={{ padding: 14, marginBottom: i < housemates.length - 1 ? 8 : 20 }}>
                <View style={[styles.row, { gap: 12, alignItems: 'center' }]}>
                  <UserChip id={u as UserId} size="lg" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', letterSpacing: -0.2 }}>{p?.displayName ?? 'N/A'}</Text>
                    <Text style={{ fontFamily: 'Courier', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.6, color: colors.fg5, marginTop: 3 }}>{(p?.roleLabel ?? '').toUpperCase() || 'NO ROLE SET'}</Text>
                  </View>
                  {isAdmin && (
                    <TouchableOpacity onPress={() => removeMember(p?.id, p?.displayName ?? 'Member')} style={{ padding: 8, borderRadius: 10, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FCA5A5' }}>
                      <Icon name="trash" size={14} color="#B91C1C" />
                    </TouchableOpacity>
                  )}
                </View>
                {p?.tagline ? (
                  <Text style={{ fontSize: 12, color: colors.fg5, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border06 }}>
                    "{p.tagline}"
                  </Text>
                ) : null}
              </Card>
            );
          })}
        </>
      )}

      {/* ── Invite section ── */}
      {state.householdId && (
        <>
          <SecLabel>Invite · member</SecLabel>
          <Card style={{ padding: 20, marginBottom: 22, alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: colors.fg5, lineHeight: 19, marginBottom: 16, textAlign: 'center', alignSelf: 'stretch' }}>
              Send this QR code or household ID to anyone you want to invite (up to 8 members).
            </Text>

            {/* Always mounted offscreen QRCode for sharing */}
            <View style={{ position: 'absolute', opacity: 0, left: -9999, zIndex: -9999 }} pointerEvents="none">
              <QRCode value={state.householdId} size={160} color={colors.foreground} backgroundColor="#ffffff" quietZone={10} getRef={(c) => (qrRef.current = c)} />
            </View>

            {!showQr ? (
              <TouchableOpacity onPress={() => setShowQr(true)} activeOpacity={0.8}
                style={{ width: '100%', height: 192, borderRadius: 20, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border20, backgroundColor: colors.bgTint02, alignItems: 'center', justifyContent: 'center', marginBottom: 16, gap: 12 }}>
                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.bgTint06, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="lock" size={20} color={colors.fg3} />
                </View>
                <Text style={{ fontFamily: 'Courier', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.8, color: colors.fg3, fontWeight: '700' }}>Tap to reveal QR Code</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => setShowQr(false)} activeOpacity={0.9}
                style={{ backgroundColor: '#fff', padding: 16, borderRadius: 20, borderWidth: 1, borderColor: colors.border12, marginBottom: 16, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 }}>
                <QRCode value={state.householdId} size={160} color={colors.foreground} backgroundColor="#ffffff" quietZone={10} />
                <Text style={{ fontFamily: 'Courier', fontSize: 8, textTransform: 'uppercase', letterSpacing: 1.2, color: colors.fg6, marginTop: 8 }}>Tap QR to hide</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity onPress={copyHouseholdId} activeOpacity={0.8}
              style={{ backgroundColor: colors.bgTint04, borderWidth: 1, borderColor: colors.border08, borderRadius: 12, padding: 12, alignSelf: 'stretch', marginBottom: 12 }}>
              <Text style={{ fontFamily: 'Courier', fontSize: 10.5, color: colors.fg3, letterSpacing: 0.2, textAlign: 'center' }} numberOfLines={1}>
                {showQr ? state.householdId : '••••••••-••••-••••-••••-••••••••••••'}
              </Text>
              <Text style={{ fontFamily: 'Courier', fontSize: 8.5, textTransform: 'uppercase', letterSpacing: 1.4, color: colors.fg6, marginTop: 4, textAlign: 'center' }}>
                {showQr ? 'TAP TO COPY HOUSEHOLD ID' : 'REVEAL QR TO VIEW ID'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={shareHousehold} activeOpacity={0.8}
              style={{ height: 48, backgroundColor: colors.foreground, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch', gap: 8, elevation: 2 }}>
              <Icon name="message" size={16} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13.5, letterSpacing: -0.1 }}>Send Invite</Text>
            </TouchableOpacity>
          </Card>
        </>
      )}

      {/* ── Sharing preferences ── */}
      <SecLabel>Sharing · preferences</SecLabel>
      <Card style={{ padding: 0, marginBottom: 22 }}>
        <SettingsRow icon="cal"  label="New events default to"  value={defaultShare.toUpperCase()} onPress={() => setModal('defaultShare')} />
        <SettingsRow icon="lock" label="Private events show as" value={privateAs.toUpperCase()} onPress={() => setModal('privateAs')} />
        <SettingsRow icon="check" label="Default To-Do view"    value={defaultTodoView.toUpperCase()} onPress={() => setModal('defaultTodoView')} />
        <SettingsRow icon="bell" label="Task notifications"     value={taskNotifications.toUpperCase()} onPress={() => setModal('taskNotifications')} />
        <SettingsRow icon="moon" label="Bedtime · quiet hours"  value={bedtime.toUpperCase()} onPress={() => setModal('bedtime')} last />
      </Card>

      {/* ── App ── */}
      <SecLabel>App</SecLabel>
      <Card style={{ padding: 0, marginBottom: 22 }}>
        <SettingsRow icon="sun" label="Appearance" value={appearance.toUpperCase()} last
          onPress={() => Alert.alert('Appearance', 'Dark mode is coming soon.')} />
      </Card>

      {/* ── Danger Zone ── */}
      <SecLabel>Danger Zone</SecLabel>
      <Card style={{ padding: 0, marginBottom: 22 }}>
        <SettingsRow icon="x" label="Leave Household" danger onPress={leaveHousehold} />
        <SettingsRow icon="reset" label="Re-run onboarding" onPress={() => dispatch({ t: 'onboard' })} />
        <SettingsRow icon="user" label="Sign out" danger last onPress={signOut} />
      </Card>

      <Text style={{ fontFamily: 'Courier', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.6, color: colors.fg6, textAlign: 'center', marginBottom: 8 }}>TIMELY · 1.0.0</Text>

      {/* ── Edit Modals ── */}
      <EditModal visible={editTaglineVisible} title="Your tagline" value={myProfile?.tagline ?? ''} onSave={saveTagline} onClose={() => setEditTaglineVisible(false)} />
      <EditModal visible={editRoleVisible} title="Your role" value={myProfile?.roleLabel ?? ''} onSave={saveRole} onClose={() => setEditRoleVisible(false)} />
      <EditModal visible={editHouseNameVisible} title="Household name" value={state.householdName ?? ''} onSave={saveHouseholdName} onClose={() => setEditHouseNameVisible(false)} />

      <PickerModal visible={modal === 'defaultShare'} title="New events default to"
        options={['Shared', 'Private']} selected={defaultShare}
        onSave={v => { setDefaultShare(v); savePref('defaultShare', v); }} onClose={() => setModal(null)} />
      <PickerModal visible={modal === 'privateAs'} title="Private events show as"
        options={['Busy · no details', 'Hidden', 'Free']} selected={privateAs}
        onSave={v => { setPrivateAs(v); savePref('privateAs', v); }} onClose={() => setModal(null)} />
      <PickerModal visible={modal === 'defaultTodoView'} title="Default To-Do view"
        options={['List', 'Board']} selected={defaultTodoView}
        onSave={v => { setDefaultTodoView(v); savePref('defaultTodoView', v); }} onClose={() => setModal(null)} />
      <PickerModal visible={modal === 'taskNotifications'} title="Task notifications"
        options={['All Activity', 'Assigned Only', 'None']} selected={taskNotifications}
        onSave={v => { setTaskNotifications(v); savePref('taskNotifications', v); }} onClose={() => setModal(null)} />
      <EditModal visible={modal === 'bedtime'} title="Bedtime · quiet hours (e.g. 23:00 → 06:00)" value={bedtime}
        onSave={v => { setBedtime(v); savePref('bedtime', v); }} onClose={() => setModal(null)} />
    </ScrollView>
  );
}
