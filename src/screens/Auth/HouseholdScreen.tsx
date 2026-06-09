import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, Modal, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useStore } from '../../lib/store';
import { colors } from '../../lib/tokens';
import type { UserId } from '../../lib/types';
import { USER_SLOTS, MAX_HOUSEHOLD_MEMBERS } from '../../lib/types';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Icon } from '../../components/Icon';

interface Props {
  userId: string;
}

type Step = 'choose' | 'create' | 'join';

export function HouseholdScreen({ userId }: Props) {
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useStore();
  const [step, setStep]           = useState<Step>('choose');
  const [showNewOptions, setShowNewOptions] = useState(false);
  const [houseName, setHouseName] = useState('Home');
  const [yourName, setYourName]   = useState('');
  const [yourRole, setYourRole]   = useState('');
  const [slot, setSlot]           = useState<UserId>('1');
  const [inviteCode, setInviteCode] = useState('');
  const [joinName, setJoinName]   = useState('');
  const [joinRole, setJoinRole]   = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  // Scanning states
  const [cameraVisible, setCameraVisible] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  async function createHousehold() {
    if (!yourName.trim()) { setError('Enter your name'); return; }
    setLoading(true);
    setError('');

    // Ensure session is present before writing
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setError('Not signed in — please restart the app and sign in again'); setLoading(false); return; }

    // 1. Create household
    const { data: hh, error: e1 } = await supabase
      .from('households')
      .insert({ name: houseName.trim() || 'Home' })
      .select('id')
      .single();

    if (e1 || !hh) { setError(`${e1?.message ?? 'Failed'} (code: ${e1?.code})`); setLoading(false); return; }

    // 2. Upsert base profile WITHOUT active_household_id (RLS requires membership to exist first)
    const { error: eProfile } = await supabase.from('profiles').upsert({
      id: userId,
      display_name: yourName.trim(),
    });
    if (eProfile) { setError(eProfile.message); setLoading(false); return; }

    // 3. Insert membership — creator always gets slot '1'
    const creatorSlot: UserId = '1';
    const { error: e2 } = await supabase.from('household_members').insert({
      user_id: userId,
      household_id: hh.id,
      short_id: creatorSlot,
      role_label: yourRole.trim() || null,
    });
    if (e2) { setError(e2.message); setLoading(false); return; }

    // 4. Now that membership exists, set active_household_id (RLS policy will pass)
    const { error: eActivate } = await supabase
      .from('profiles')
      .update({ active_household_id: hh.id })
      .eq('id', userId);

    setLoading(false);
    if (eActivate) { setError(eActivate.message); return; }

    dispatch({ t: 'setHousehold', householdId: hh.id });
    dispatch({ t: 'setViewer', u: creatorSlot });
    dispatch({ t: 'setProfiles', profiles: {
      [creatorSlot]: { displayName: yourName.trim(), shortId: creatorSlot, roleLabel: yourRole.trim(), tagline: '' }
    } });
  }

  async function joinWithCode(codeToJoin: string) {
    if (!joinName.trim()) { setError('Enter your name'); return; }
    if (!codeToJoin.trim()) { setError('Enter invite code'); return; }
    setLoading(true);
    setError('');

    // Extract UUID from the invite code string
    const uuidRegex = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;
    const match = codeToJoin.match(uuidRegex);
    const hhId = match ? match[0] : codeToJoin.trim();

    const { data: hh, error: e1 } = await supabase
      .from('households')
      .select('id')
      .eq('id', hhId)
      .single();

    if (e1) {
      setError(`${e1.message} (code: ${e1.code})`);
      setLoading(false);
      return;
    }
    if (!hh) {
      setError('Household not found — check the invite code');
      setLoading(false);
      return;
    }

    // Determine which slot is free
    const { data: existing } = await supabase
      .from('household_members')
      .select('short_id, user_id')
      .eq('household_id', hhId);

    const others = (existing ?? []).filter((p: { user_id: string }) => p.user_id !== userId);
    const takenByOthers = others.map((p: { short_id: string }) => p.short_id);

    if (takenByOthers.length >= MAX_HOUSEHOLD_MEMBERS) {
      setError(`This household is full (max ${MAX_HOUSEHOLD_MEMBERS} members)`);
      setLoading(false);
      return;
    }

    const mySlot = USER_SLOTS.find(s => !takenByOthers.includes(s)) ?? '1';

    // Upsert base profile WITHOUT active_household_id (RLS requires membership to exist first)
    const { error: eProfile } = await supabase.from('profiles').upsert({
      id: userId,
      display_name: joinName.trim(),
    });
    if (eProfile) { setError(eProfile.message); setLoading(false); return; }

    // Insert membership
    const { error: e2 } = await supabase.from('household_members').upsert({
      user_id: userId,
      household_id: hhId,
      short_id: mySlot,
      role_label: joinRole.trim() || null,
    }, { onConflict: 'user_id,household_id' });
    if (e2) { setError(e2.message); setLoading(false); return; }

    // Now that membership exists, set active_household_id (RLS policy will pass)
    const { error: eActivate } = await supabase
      .from('profiles')
      .update({ active_household_id: hhId })
      .eq('id', userId);

    setLoading(false);
    if (eActivate) { setError(eActivate.message); return; }

    // Load all profiles in this household
    const { data: allMembers } = await supabase
      .from('household_members')
      .select('user_id, short_id, role_label, tagline, profiles(display_name, preferences)')
      .eq('household_id', hhId);

    const profileMap: Record<string, { displayName: string; shortId: UserId; roleLabel: string; tagline: string }> = {};
    (allMembers ?? []).forEach((m: any) => {
      profileMap[m.short_id] = {
        displayName: m.profiles?.display_name ?? 'N/A',
        shortId:     m.short_id as UserId,
        roleLabel:   m.role_label ?? '',
        tagline:     m.tagline ?? ''
      };
    });

    dispatch({ t: 'setHousehold', householdId: hhId });
    dispatch({ t: 'setViewer', u: mySlot as UserId });
    dispatch({ t: 'setProfiles', profiles: profileMap });
  }

  async function joinHousehold() {
    await joinWithCode(inviteCode);
  }

  async function startCameraScan() {
    if (!joinName.trim()) { setError('Enter your name first'); return; }
    if (!permission) {
      setError('Camera permission is loading');
      return;
    }
    if (!permission.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert('Permission Denied', 'Camera permission is required to scan QR codes.');
        return;
      }
    }
    setScanned(false);
    setCameraVisible(true);
  }

  function handleBarcodeScanned({ data }: { data: string }) {
    setScanned(true);
    setCameraVisible(false);
    setInviteCode(data);
    joinWithCode(data);
  }

  async function uploadAndScanQr() {
    if (!joinName.trim()) { setError('Enter your name first'); return; }
    
    // Request image library permission
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Gallery access is required to select a QR code.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
    });

    if (result.canceled || !result.assets?.[0]?.uri) {
      return;
    }

    const selectedUri = result.assets[0].uri;
    setUploading(true);
    setError('');

    try {
      const uploadResult = await FileSystem.uploadAsync('https://api.qrserver.com/v1/read-qr-code/', selectedUri, {
        fieldName: 'file',
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      });

      const resJson = JSON.parse(uploadResult.body);
      const symbol = resJson[0]?.symbol[0];
      
      if (symbol?.data) {
        setInviteCode(symbol.data);
        setUploading(false);
        joinWithCode(symbol.data);
      } else {
        setUploading(false);
        setError(symbol?.error || 'Could not find a valid QR code in the selected image');
      }
    } catch (err: any) {
      setUploading(false);
      setError(`QR Scan failed: ${err.message}`);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[s.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled">
        <Text style={s.wordmark}>TIMELY</Text>

        {step === 'choose' && state.userHouseholds.length > 0 && !showNewOptions ? (
          <>
            <Text style={s.headline}>Welcome back.</Text>
            <Text style={s.sub}>Select a household to enter, or create/join a new one.</Text>
            {state.userHouseholds.map((h) => (
              <TouchableOpacity
                key={h.id}
                onPress={async () => {
                  setLoading(true);
                  setError('');
                  try {
                    const { error } = await supabase
                      .from('profiles')
                      .update({ active_household_id: h.id })
                      .eq('id', userId);
                    if (error) {
                      setError(error.message);
                    } else {
                      dispatch({ t: 'setHousehold', householdId: h.id });
                    }
                  } catch (err: any) {
                    setError(err.message);
                  } finally {
                    setLoading(false);
                  }
                }}
                style={s.card}
              >
                <Text style={[s.cardTitle, { color: '#fff' }]}>{h.name}</Text>
                <Text style={[s.cardSub, { color: 'rgba(255,255,255,0.6)' }]}>Tap to enter workspace</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[s.card, s.cardOutline]} onPress={() => setShowNewOptions(true)}>
              <Text style={s.cardTitle}>Create or join new household</Text>
              <Text style={s.cardSub}>Set up a new shared home</Text>
            </TouchableOpacity>
          </>
        ) : step === 'choose' ? (
          <>
            <Text style={s.headline}>Set up{'\n'}your home.</Text>
            <Text style={s.sub}>Is this the first phone, or are you joining someone who's already set up?</Text>
            <TouchableOpacity style={s.card} onPress={() => setStep('create')}>
              <Text style={[s.cardTitle, { color: '#fff' }]}>Create household</Text>
              <Text style={[s.cardSub, { color: 'rgba(255,255,255,0.6)' }]}>First phone — you'll get an invite code to share</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.card, s.cardOutline]} onPress={() => setStep('join')}>
              <Text style={s.cardTitle}>Join household</Text>
              <Text style={s.cardSub}>Paste the invite code your partner sent</Text>
            </TouchableOpacity>
            {state.userHouseholds.length > 0 && (
              <TouchableOpacity
                onPress={() => setShowNewOptions(false)}
                style={[s.card, s.cardOutline, { marginTop: 12, borderColor: colors.border08, alignItems: 'center' }]}
              >
                <Text style={[s.cardTitle, { fontSize: 15, marginBottom: 0 }]}>Back to my households</Text>
              </TouchableOpacity>
            )}
          </>
        ) : null}

        {step === 'create' && (
          <>
            <Text style={s.headline}>Create{'\n'}household.</Text>
            <Text style={s.fieldLabel}>HOUSEHOLD NAME</Text>
            <TextInput style={s.input} value={houseName} onChangeText={setHouseName} placeholder="Home" placeholderTextColor={colors.fg4} />
            <Text style={s.fieldLabel}>YOUR NAME</Text>
            <TextInput style={s.input} value={yourName} onChangeText={setYourName} placeholder="e.g. Maya" placeholderTextColor={colors.fg4} autoFocus />
            <Text style={s.fieldLabel}>YOUR ROLE (OPTIONAL)</Text>
            <TextInput style={s.input} value={yourRole} onChangeText={setYourRole} placeholder="e.g. Designer at Studio" placeholderTextColor={colors.fg4} />
            {error ? <Text style={s.err}>{error}</Text> : null}
            <TouchableOpacity style={s.btn} onPress={createHousehold} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnLabel}>CREATE</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setStep('choose'); setError(''); }} style={s.link}>
              <Text style={s.linkLabel}>Back</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'join' && (
          <>
            <Text style={s.headline}>Join{'\n'}household.</Text>
            <Text style={s.sub}>Your partner can find the household ID in the You tab → Share with partner.</Text>
            <Text style={s.fieldLabel}>YOUR NAME</Text>
            <TextInput style={s.input} value={joinName} onChangeText={setJoinName} placeholder="e.g. Arjun" placeholderTextColor={colors.fg4} autoFocus />
            <Text style={s.fieldLabel}>YOUR ROLE (OPTIONAL)</Text>
            <TextInput style={s.input} value={joinRole} onChangeText={setJoinRole} placeholder="e.g. PM at Resonera" placeholderTextColor={colors.fg4} />

            <Text style={s.fieldLabel}>SCAN INVITE QR CODE</Text>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
              <TouchableOpacity onPress={startCameraScan} style={[s.scanBtn, { flex: 1, flexDirection: 'row', gap: 8 }]}>
                <Icon name="camera" size={16} color={colors.foreground} />
                <Text style={s.scanBtnLabel}>CAMERA SCAN</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={uploadAndScanQr} style={[s.scanBtn, { flex: 1, flexDirection: 'row', gap: 8 }]} disabled={uploading}>
                {uploading ? (
                  <ActivityIndicator color={colors.foreground} />
                ) : (
                  <>
                    <Icon name="image" size={16} color={colors.foreground} />
                    <Text style={s.scanBtnLabel}>UPLOAD IMAGE</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            <Text style={s.fieldLabel}>ALTERNATIVE: INVITE CODE (MANUAL)</Text>
            <TextInput
              style={s.input}
              value={inviteCode}
              onChangeText={setInviteCode}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              placeholderTextColor={colors.fg4}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {error ? <Text style={s.err}>{error}</Text> : null}
            <TouchableOpacity style={s.btn} onPress={joinHousehold} disabled={loading || uploading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnLabel}>JOIN HOUSEHOLD</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setStep('choose'); setError(''); }} style={s.link}>
              <Text style={s.linkLabel}>Back</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* Camera Scanning Modal */}
      <Modal visible={cameraVisible} animationType="slide" onRequestClose={() => setCameraVisible(false)}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <CameraView
            style={StyleSheet.absoluteFill}
            onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
            barcodeScannerSettings={{
              barcodeTypes: ['qr'],
            }}
          />
          {/* Viewfinder box overlay */}
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <View style={{
              width: 240,
              height: 240,
              borderWidth: 3,
              borderColor: '#fff',
              borderRadius: 24,
              backgroundColor: 'transparent',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.3,
              shadowRadius: 20
            }} />
            <Text style={{
              marginTop: 24,
              color: '#fff',
              fontSize: 13,
              fontWeight: '700',
              letterSpacing: 2,
              fontFamily: 'SpaceMono',
              textShadowColor: 'rgba(0,0,0,0.8)',
              textShadowOffset: { width: 1, height: 1 },
              textShadowRadius: 4
            }}>
              Align QR Code in the frame
            </Text>
          </View>

          {/* Close Scanner button */}
          <TouchableOpacity
            onPress={() => setCameraVisible(false)}
            style={{
              position: 'absolute',
              bottom: 48,
              left: 28,
              right: 28,
              height: 52,
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              borderWidth: 1.5,
              borderColor: 'rgba(255,255,255,0.4)',
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontFamily: 'SpaceMono', fontSize: 12, letterSpacing: 2, fontWeight: '700' }}>
              CLOSE SCANNER
            </Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root:  { flex: 1, backgroundColor: colors.background },
  inner: { paddingHorizontal: 28, paddingBottom: 40 },
  wordmark: {
    fontFamily: 'SpaceMono',
    fontSize: 11,
    letterSpacing: 3,
    color: colors.fg3,
    marginBottom: 32,
  },
  headline: {
    fontSize: 38,
    fontWeight: '700',
    color: colors.foreground,
    lineHeight: 44,
    letterSpacing: -1,
    marginBottom: 20,
  },
  sub: { fontSize: 15, color: colors.fg5, lineHeight: 22, marginBottom: 28 },
  fieldLabel: {
    fontFamily: 'SpaceMono',
    fontSize: 10,
    letterSpacing: 2,
    color: colors.fg4,
    marginBottom: 6,
    marginTop: 16,
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: colors.border12,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: colors.foreground,
    backgroundColor: colors.bgTint02,
  },
  row: { flexDirection: 'row', gap: 10, marginTop: 4 },
  slotBtn: {
    flex: 1,
    height: 46,
    borderWidth: 1,
    borderColor: colors.border12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotActive:      { backgroundColor: colors.foreground, borderColor: colors.foreground },
  slotLabel:       { fontSize: 14, color: colors.fg5 },
  slotLabelActive: { color: '#fff', fontWeight: '600' },
  card: {
    borderRadius: 14,
    backgroundColor: colors.foreground,
    padding: 20,
    marginBottom: 12,
  },
  cardOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.border12,
  },
  cardTitle:   { fontSize: 17, fontWeight: '700', color: colors.foreground, marginBottom: 4 },
  cardSub:     { fontSize: 13, color: colors.fg5 },
  btn: {
    height: 52,
    backgroundColor: colors.foreground,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  btnLabel: { color: '#fff', fontFamily: 'SpaceMono', fontSize: 12, letterSpacing: 2 },
  link: { marginTop: 20, alignSelf: 'center' },
  linkLabel: { color: colors.fg5, fontSize: 14 },
  err: { color: colors.destructive, fontSize: 13, marginTop: 8 },
  scanBtn: {
    height: 48,
    borderWidth: 1.5,
    borderColor: colors.border20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  scanBtnLabel: {
    fontFamily: 'SpaceMono',
    fontSize: 11,
    fontWeight: '700',
    color: colors.foreground,
    letterSpacing: 1,
  },
});
