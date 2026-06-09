import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../lib/tokens';
import { UserChip, UserStripe, Card, CardInv, CardAlt, styles as S } from '../../components/Primitives';
import { Icon } from '../../components/Icon';

const TOTAL = 4;

interface Props {
  onDone: () => void;
}

export function OnboardingScreen({ onDone }: Props) {
  const [step, setStep] = useState(0);
  const insets = useSafeAreaInsets();

  const next = () => (step < TOTAL - 1 ? setStep(step + 1) : onDone());
  const back = () => step > 0 && setStep(step - 1);

  return (
    <View style={[ob.root, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
      <View style={{ flex: 1, paddingHorizontal: 28 }}>
        {/* Progress */}
        <View style={ob.progress}>
          {Array.from({ length: TOTAL }).map((_, i) => (
            <View key={i} style={[ob.seg, i <= step && ob.segOn]} />
          ))}
        </View>

        {/* Header row */}
        <View style={[S.between, { marginBottom: 28 }]}>
          <Text style={ob.monoSm}>TIMELY · {step + 1}/{TOTAL}</Text>
          <TouchableOpacity onPress={onDone} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={[ob.monoSm, { color: colors.fg6 }]}>SKIP</Text>
          </TouchableOpacity>
        </View>

        {/* Step content */}
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 24 }}
        >
          {step === 0 && <StepCalendar />}
          {step === 1 && <StepTodosKanban />}
          {step === 2 && <StepChatDocs />}
          {step === 3 && <StepHousehold />}
        </ScrollView>

        {/* Footer */}
        <View style={[S.row, { gap: 10, marginTop: 16 }]}>
          {step > 0 && (
            <TouchableOpacity onPress={back} style={ob.btnOutline}>
              <Icon name="chevLeft" size={18} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={next}
            style={[ob.btnPrimary, { flex: 1, flexDirection: 'row', gap: 8 }]}
          >
            <Text style={ob.btnPrimaryTxt}>
              {step === TOTAL - 1 ? 'Set up my home' : 'Continue'}
            </Text>
            <Icon name="arrow" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── Step 1: Shared Calendar ────────────────────────────────────────────────

function StepCalendar() {
  const events = [
    { id: '1' as const, ev: 'Morning run',   time: '06:30', loc: 'Carter Road',  priv: false },
    { id: '1' as const, ev: 'Therapy',       time: '10:00', loc: 'Private',      priv: true  },
    { id: '2' as const, ev: 'Client review', time: '14:00', loc: 'Studio',       priv: false },
    { id: 'B' as const, ev: 'Dinner plan',   time: '19:30', loc: 'La Mer',       priv: false },
  ];

  return (
    <View>
      <Text style={ob.label}>TODAY · SHARED CALENDAR</Text>
      <Text style={ob.hero}>
        One timeline.{'\n'}
        <Text style={ob.heroMuted}>Your day,{'\n'}together.</Text>
      </Text>
      <Text style={ob.body}>
        See each other's day in real time. Private events show as "busy" — no details shared.
        Reschedule anything with one tap.
      </Text>

      <Card style={{ marginTop: 24, padding: 16 }}>
        <Text style={[ob.monoXs, { marginBottom: 12 }]}>FRIDAY · YOUR VIEW</Text>
        <View style={{ gap: 9 }}>
          {events.map((e, i) => (
            <View
              key={i}
              style={ob.eventRow}
            >
              <UserStripe id={e.priv ? 'priv' : e.id} priv={e.priv} />
              <View style={{ flex: 1 }}>
                <Text style={ob.eventTitle}>{e.priv ? 'Private · busy' : e.ev}</Text>
                <Text style={ob.monoXs}>{e.time}{!e.priv && ` · ${e.loc.toUpperCase()}`}</Text>
              </View>
              {e.priv && <Icon name="lock" size={13} color={colors.fg6} />}
              {!e.priv && (
                <View style={ob.chipRow}>
                  <UserChip id={e.id} />
                </View>
              )}
            </View>
          ))}
        </View>
      </Card>

      <View style={[S.row, { gap: 10, marginTop: 12 }]}>
        <CardAlt style={{ flex: 1, padding: 14 }}>
          <Icon name="cal" size={16} color={colors.fg3} />
          <Text style={[ob.featureLabel, { marginTop: 8 }]}>Shared events</Text>
          <Text style={ob.featureSub}>BOTH SEE IT</Text>
        </CardAlt>
        <CardAlt style={{ flex: 1, padding: 14 }}>
          <Icon name="lock" size={16} color={colors.fg3} />
          <Text style={[ob.featureLabel, { marginTop: 8 }]}>Private toggle</Text>
          <Text style={ob.featureSub}>SHOWS AS BUSY</Text>
        </CardAlt>
        <CardAlt style={{ flex: 1, padding: 14 }}>
          <Icon name="timer" size={16} color={colors.fg3} />
          <Text style={[ob.featureLabel, { marginTop: 8 }]}>Reschedule</Text>
          <Text style={ob.featureSub}>1-TAP MOVE</Text>
        </CardAlt>
      </View>
    </View>
  );
}

// ─── Step 2: Todos + Kanban ──────────────────────────────────────────────────

function StepTodosKanban() {
  const lanes: { label: string; color: string; items: { text: string; p: 1|2|3; who: '1'|'2'|'B' }[] }[] = [
    {
      label: 'TODO',
      color: colors.border12,
      items: [
        { text: 'Pick paint colour', p: 2, who: 'B' },
        { text: 'Book dentist',      p: 3, who: '1' },
      ],
    },
    {
      label: 'IN PROGRESS',
      color: '#141414',
      items: [
        { text: 'Kitchen remodel', p: 1, who: '2' },
      ],
    },
    {
      label: 'DONE',
      color: colors.border15,
      items: [
        { text: 'Pay rent',    p: 2, who: 'B' },
        { text: 'Grocery run', p: 3, who: '1' },
      ],
    },
  ];

  const pDot = (p: 1|2|3) => {
    const c = p === 1 ? '#141414' : p === 2 ? colors.fg4 : colors.fg8;
    return <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c }} />;
  };

  return (
    <View>
      <Text style={ob.label}>TODOS · KANBAN · PLAN</Text>
      <Text style={ob.hero}>
        Tasks flow{'\n'}
        <Text style={ob.heroMuted}>across boards{'\n'}& weeks.</Text>
      </Text>
      <Text style={ob.body}>
        Shared kanban with project folders, subtasks, priorities and workload estimates.
        The Plan tab maps everything across a weekly timeline.
      </Text>

      {/* Kanban mini-board */}
      <View style={[S.row, { gap: 8, marginTop: 24, alignItems: 'flex-start', marginHorizontal: 2 }]}>
        {lanes.map((lane) => (
          <View key={lane.label} style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 }}>
              <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: lane.color }} />
              <Text style={ob.monoXs}>{lane.label}</Text>
            </View>
            <View style={{ gap: 7 }}>
              {lane.items.map((item, i) => (
                <Card key={i} style={{ padding: 10, gap: 6 }}>
                  <View style={[S.row, { gap: 5 }]}>
                    {pDot(item.p)}
                    <Text style={{ fontSize: 11, fontWeight: '600', flex: 1, letterSpacing: -0.1, lineHeight: 14 }}>
                      {item.text}
                    </Text>
                  </View>
                  <UserChip id={item.who as any} />
                </Card>
              ))}
            </View>
          </View>
        ))}
      </View>

      {/* Feature row */}
      <CardInv style={{ marginTop: 14, marginHorizontal: 2, padding: 16, flexDirection: 'row', gap: 16, alignItems: 'center', shadowOpacity: 0.12, shadowRadius: 10, elevation: 6 }}>
        <Icon name="cal" size={20} color="rgba(255,255,255,0.5)" />
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '800', fontSize: 15, color: '#fff', letterSpacing: -0.3 }}>Plan view</Text>
          <Text style={{ fontFamily: 'Courier', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.8, color: 'rgba(255,255,255,0.4)', marginTop: 3 }}>
            WEEKLY OVERVIEW · PAST & UPCOMING
          </Text>
        </View>
        <Icon name="arrow" size={16} color="rgba(255,255,255,0.4)" />
      </CardInv>

      <View style={[S.row, { gap: 8, marginTop: 8 }]}>
        {[
          { icon: 'flag' as const,       label: 'Priorities',      sub: 'P1 · P2 · P3' },
          { icon: 'users' as const,      label: 'Project folders', sub: 'BY CONTEXT' },
          { icon: 'plus' as const,       label: 'Subtasks',        sub: 'NESTED' },
        ].map(({ icon, label, sub }) => (
          <CardAlt key={label} style={{ flex: 1, padding: 12 }}>
            <Icon name={icon} size={15} color={colors.fg3} />
            <Text style={[ob.featureLabel, { marginTop: 7 }]}>{label}</Text>
            <Text style={ob.featureSub}>{sub}</Text>
          </CardAlt>
        ))}
      </View>
    </View>
  );
}

// ─── Step 3: Chat + Docs ─────────────────────────────────────────────────────

function StepChatDocs() {
  const messages = [
    { id: '1' as const, text: 'Did you move the dentist appointment?', mine: true  },
    { id: '2' as const, text: 'Yes — rescheduled to Thursday 10am.',   mine: false },
    { id: '1' as const, text: 'Perfect, updated the calendar 👌',      mine: true  },
  ];

  const docs = [
    { title: 'House Rules',       tags: ['home', 'shared'],  fav: true  },
    { title: 'Monthly Budget',    tags: ['finance'],          fav: false },
    { title: "Vacation Plan '25", tags: ['travel'],           fav: true  },
  ];

  return (
    <View>
      <Text style={ob.label}>CHAT · DOCS · WIKI</Text>
      <Text style={ob.hero}>
        Talk, plan,{'\n'}
        <Text style={ob.heroMuted}>document{'\n'}everything.</Text>
      </Text>
      <Text style={ob.body}>
        End-to-end encrypted chat channels — no one else can read them.
        A shared wiki for house rules, budgets, trip plans and anything you want to keep.
      </Text>

      {/* Chat preview */}
      <Card style={{ marginTop: 24, padding: 14 }}>
        <View style={[S.row, { gap: 8, marginBottom: 14 }]}>
          <Icon name="lock" size={13} color={colors.fg4} />
          <Text style={ob.monoXs}>GENERAL SYNC ROOM · E2EE</Text>
        </View>
        <View style={{ gap: 8 }}>
          {messages.map((m, i) => (
            <View
              key={i}
              style={{
                alignSelf: m.mine ? 'flex-end' : 'flex-start',
                flexDirection: 'row',
                alignItems: 'flex-end',
                gap: 6,
                maxWidth: '85%',
              }}
            >
              {!m.mine && <UserChip id={m.id} size="sm" />}
              <View
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 14,
                  borderBottomLeftRadius: m.mine ? 14 : 4,
                  borderBottomRightRadius: m.mine ? 4 : 14,
                  backgroundColor: m.mine ? colors.foreground : colors.bgTint06,
                }}
              >
                <Text style={{ fontSize: 13, color: m.mine ? '#fff' : colors.fg1, lineHeight: 18 }}>
                  {m.text}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </Card>

      {/* Docs preview */}
      <Card style={{ marginTop: 10, padding: 14 }}>
        <Text style={[ob.monoXs, { marginBottom: 12 }]}>WIKI DOCS</Text>
        <View style={{ gap: 8 }}>
          {docs.map((doc, i) => (
            <View
              key={i}
              style={[S.row, {
                padding: 10,
                backgroundColor: colors.bgTint02,
                borderWidth: 1,
                borderColor: colors.border08,
                borderRadius: 10,
                gap: 10,
              }]}
            >
              <Icon name={doc.fav ? 'bolt' : 'edit'} size={14} color={doc.fav ? colors.fg2 : colors.fg6} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', letterSpacing: -0.1 }}>{doc.title}</Text>
                <Text style={ob.monoXs}>{doc.tags.map(t => t.toUpperCase()).join(' · ')}</Text>
              </View>
            </View>
          ))}
        </View>
      </Card>
    </View>
  );
}

// ─── Step 4: Household ───────────────────────────────────────────────────────

function StepHousehold() {
  const members: ('1'|'2'|'3'|'4'|'5'|'6'|'7'|'8')[] = ['1', '2', '3', '4', '5', '6', '7', '8'];

  return (
    <View>
      <Text style={ob.label}>HOUSEHOLD · UP TO 8 MEMBERS</Text>
      <Text style={ob.hero}>
        Your home,{'\n'}
        <Text style={ob.heroMuted}>your people.</Text>
      </Text>
      <Text style={ob.body}>
        Invite up to 8 people via QR code or a share link.
        Each person gets their own colour and slot — calendar, tasks and chat all stay in sync.
      </Text>

      {/* Member chips */}
      <CardInv style={{ marginTop: 24, marginHorizontal: 2, padding: 20, shadowOpacity: 0.12, shadowRadius: 10, elevation: 6 }}>
        <Text style={{ fontFamily: 'Courier', fontSize: 9, textTransform: 'uppercase', letterSpacing: 2, color: 'rgba(255,255,255,0.4)', marginBottom: 16 }}>
          UP TO 8 MEMBERS
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {members.map((id) => (
            <View key={id} style={{ alignItems: 'center', gap: 6 }}>
              <UserChip id={id} size="xl" />
              <Text style={{ fontFamily: 'Courier', fontSize: 8, letterSpacing: 1.5, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
                {id === '1' ? 'You' : `Slot ${id}`}
              </Text>
            </View>
          ))}
        </View>
      </CardInv>

      {/* Feature grid */}
      <View style={[S.row, { gap: 8, marginTop: 12 }]}>
        {[
          { icon: 'users' as const,  label: 'QR invite',     sub: 'SHARE A LINK OR CODE' },
          { icon: 'bell' as const,   label: 'Quiet hours',   sub: 'HOUSEHOLD BEDTIME' },
          { icon: 'user' as const,   label: 'Profiles',      sub: 'NAME + ROLE LABEL' },
        ].map(({ icon, label, sub }) => (
          <CardAlt key={label} style={{ flex: 1, padding: 12 }}>
            <Icon name={icon} size={15} color={colors.fg3} />
            <Text style={[ob.featureLabel, { marginTop: 7 }]}>{label}</Text>
            <Text style={ob.featureSub}>{sub}</Text>
          </CardAlt>
        ))}
      </View>

      <CardAlt style={{ marginTop: 10, padding: 16 }}>
        <Text style={ob.monoXs}>YOU'RE ALL SET</Text>
        <Text style={{ fontWeight: '900', fontSize: 20, lineHeight: 26, letterSpacing: -0.6, marginTop: 8 }}>
          Create your household{'\n'}
          <Text style={{ color: colors.fg5 }}>and invite your people.</Text>
        </Text>
      </CardAlt>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const ob = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  } as any,
  progress: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 20,
  },
  seg: {
    height: 3,
    flex: 1,
    backgroundColor: colors.bgTint06,
    borderRadius: 2,
  },
  segOn: { backgroundColor: colors.foreground },
  monoSm: {
    fontFamily: 'Courier',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 2.2,
    color: colors.fg5,
  } as any,
  monoXs: {
    fontFamily: 'Courier',
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 1.8,
    color: colors.fg5,
  } as any,
  label: {
    fontFamily: 'Courier',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 2.2,
    color: colors.fg5,
    marginBottom: 0,
  } as any,
  hero: {
    fontWeight: '900',
    fontSize: 44,
    lineHeight: 50,
    letterSpacing: -2,
    marginTop: 12,
    marginBottom: 16,
    color: colors.fg1,
  } as any,
  heroMuted: {
    color: colors.fg8,
  } as any,
  body: {
    fontSize: 14,
    color: colors.fg4,
    fontWeight: '400',
    lineHeight: 21,
    maxWidth: 310,
  } as any,
  eventRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    padding: 10,
    backgroundColor: colors.bgTint02,
    borderWidth: 1,
    borderColor: colors.border08,
    borderRadius: 12,
  } as any,
  eventTitle: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.1,
  } as any,
  chipRow: {
    flexDirection: 'row',
    gap: 4,
  } as any,
  featureLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: colors.fg2,
  } as any,
  featureSub: {
    fontFamily: 'Courier',
    fontSize: 8,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: colors.fg6,
    marginTop: 2,
  } as any,
  btnPrimary: {
    height: 52,
    backgroundColor: colors.foreground,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  } as any,
  btnPrimaryTxt: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
    letterSpacing: -0.2,
  } as any,
  btnOutline: {
    width: 52,
    height: 52,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border15,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  } as any,
});
