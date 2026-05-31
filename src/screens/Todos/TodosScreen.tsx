import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useStore, toggleTodoItem } from '../../lib/store';
import { colors, SLOT_COLORS } from '../../lib/tokens';
import { USERS } from '../../data/seed';
import { ScreenHeader, Card, CardAlt, SecLabel, UserChip, AppSwitch, IconBtn, styles } from '../../components/Primitives';
import { Icon } from '../../components/Icon';
import type { Todo } from '../../lib/types';
import Svg, { Circle } from 'react-native-svg';

function CircularProgress({ done, total }: { done: number; total: number }) {
  if (total === 0) return null;
  const pct = done / total;
  const size = 12;
  const strokeWidth = 1.8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - pct);

  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background Circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.border08}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Foreground (Progress) Circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.foreground}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
    </View>
  );
}

const BUCKET_ORDER = ['TODAY', 'TOMORROW', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN', 'THIS WEEK', 'NEXT WEEK', 'LATER'];

export function TodosScreen() {
  const { state, dispatch } = useStore();
  const [tab, setTab] = useState<'SHARED' | 'MINE' | 'ALL'>('SHARED');
  const [showDone, setShowDone] = useState(false);
  const [justMe, setJustMe] = useState(false);
  const viewer = state.viewer;
  const all = state.todos;

  const filtered = all.filter(t => {
    if (t.parentId) return false; // Sub-todos only show inside parent task details
    
    // "Just Me" focus filter
    if (justMe && (!t.assignedTo || !t.assignedTo.includes(viewer))) {
      return false;
    }

    if (tab === 'SHARED') {
      if (!t.shared) return false;
      // if sharedWith is set, only show to members in that list
      if (t.sharedWith) return t.sharedWith.includes(viewer);
      return true;
    }
    if (tab === 'MINE') return t.who === viewer;
    return true;
  }).filter(t => showDone || !t.done);

  const openCount = filtered.filter(t => !t.done).length;
  const doneToday = all.filter(t => t.done).length;

  const buckets: Record<string, Todo[]> = {};
  filtered.forEach(t => {
    if (!buckets[t.due]) buckets[t.due] = [];
    buckets[t.due].push(t);
  });
  const ordered = BUCKET_ORDER.filter(k => buckets[k]);

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 18, paddingBottom: 130 }}>
      <ScreenHeader
        eyebrow={`TO-DOS · ${openCount} OPEN · ${doneToday} DONE TODAY`}
        title="Take"
        ghost="the small stuff off your mind."
        sub="Shared lives in the house. Yours stays yours."
        right={
          <IconBtn inv onPress={() => dispatch({ t: 'openNewTodo' })}>
            <Icon name="plus" size={18} color="#fff" />
          </IconBtn>
        }
      />

      {/* Tab pills */}
      <Card style={{ padding: 4, marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {([
            { id: 'SHARED', label: 'Shared', count: all.filter(t => t.shared && !t.done).length },
            { id: 'MINE',   label: 'Mine',   count: all.filter(t => t.who === viewer && !t.done).length },
            { id: 'ALL',    label: 'All',    count: all.filter(t => !t.done).length },
          ] as const).map(t => (
            <TouchableOpacity key={t.id} onPress={() => setTab(t.id)}
              style={{ flex: 1, height: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4,
                backgroundColor: tab === t.id ? colors.foreground : 'transparent' }}>
              <Text style={{ fontSize: 13, fontWeight: '700', letterSpacing: -0.1, color: tab === t.id ? '#fff' : colors.fg3 }}>{t.label}</Text>
              <Text style={{ fontFamily: 'Courier', fontSize: 10, color: tab === t.id ? 'rgba(255,255,255,0.6)' : colors.fg5 }}>· {String(t.count).padStart(2, '0')}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Card>

      <View style={[styles.between, { marginBottom: 18, paddingHorizontal: 4 }]}>
        <Text style={{ fontFamily: 'Courier', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.8, color: colors.fg5 }}>SORTED BY DUE</Text>
        <View style={[styles.row, { gap: 14 }]}>
          <View style={[styles.row, { gap: 6 }]}>
            <Text style={{ fontFamily: 'Courier', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.8, color: colors.fg5 }}>JUST ME</Text>
            <AppSwitch value={justMe} onChange={setJustMe} />
          </View>
          <View style={[styles.row, { gap: 6 }]}>
            <Text style={{ fontFamily: 'Courier', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.8, color: colors.fg5 }}>SHOW DONE</Text>
            <AppSwitch value={showDone} onChange={setShowDone} />
          </View>
        </View>
      </View>

      {ordered.length === 0 && (
        <CardAlt style={{ alignItems: 'center', padding: 32, marginBottom: 22 }}>
          <Text style={{ fontWeight: '900', fontSize: 28, letterSpacing: -1, lineHeight: 33 }}>
            Clean. <Text style={{ color: colors.fg9 }}>Nothing to do.</Text>
          </Text>
          <Text style={{ fontFamily: 'Courier', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.8, color: colors.fg5, marginTop: 12 }}>ENJOY THE QUIET, OR ADD SOMETHING.</Text>
        </CardAlt>
      )}

      {ordered.map(k => (
        <React.Fragment key={k}>
          <SecLabel count={buckets[k].length}>Due · {k.toLowerCase()}</SecLabel>
          <Card style={{ padding: 4, marginBottom: 18 }}>
            {buckets[k].map((td, i, arr) => {
              const subtasks = all.filter(sub => sub.parentId === td.id);
              const subCount = subtasks.length;
              const subDone = subtasks.filter(sub => sub.done).length;
              const assignedToMe = td.assignedTo && td.assignedTo.includes(viewer);

              return (
                <React.Fragment key={td.id}>
                  <View
                    style={{ position: 'relative', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14,
                      borderBottomWidth: (i < arr.length - 1 || subCount > 0) ? 1 : 0, borderBottomColor: colors.border06 }}>
                    
                    {/* Assigned to Me vertical indicator stripe */}
                    {assignedToMe && (
                      <View style={{
                        position: 'absolute',
                        left: 2,
                        top: 6,
                        bottom: 6,
                        width: 3.5,
                        borderRadius: 2,
                        backgroundColor: SLOT_COLORS[viewer]?.bg ?? colors.foreground
                      }} />
                    )}
                    
                    {/* Left Checkbox button */}
                    <TouchableOpacity onPress={() => toggleTodoItem(td, state, dispatch)}
                      style={{ paddingVertical: 14, paddingRight: 6 }}>
                      <View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 1.5,
                        borderColor: td.done ? colors.foreground : colors.border20,
                        backgroundColor: td.done ? colors.foreground : '#fff',
                        alignItems: 'center', justifyContent: 'center' }}>
                        {td.done && <Icon name="check" size={12} color="#fff" strokeWidth={2.4} />}
                      </View>
                    </TouchableOpacity>

                    {/* Rest of row: opens To-do Details Sheet */}
                    <TouchableOpacity onPress={() => dispatch({ t: 'openTodoDetail', todo: td })}
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingLeft: 6 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', letterSpacing: -0.1,
                          textDecorationLine: td.done ? 'line-through' : 'none',
                          color: td.done ? colors.fg6 : colors.fg1 }}>{td.text}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                          <Text style={{ fontFamily: 'Courier', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.6, color: colors.fg5 }}>
                            {td.shared ? 'SHARED' : 'PERSONAL'} · P{td.p}
                            {subCount > 0 && ` · SUBTASKS: ${subDone}/${subCount}`}
                          </Text>
                          {subCount > 0 && (
                            <CircularProgress done={subDone} total={subCount} />
                          )}
                        </View>
                      </View>

                      {/* Member Assignee Chip(s) stacked */}
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

                  {/* Nested Subtasks list */}
                  {subtasks.map((sub, subIdx) => {
                    const isLastSub = subIdx === subtasks.length - 1;
                    const borderBottom = (!isLastSub || i < arr.length - 1) ? 1 : 0;

                    return (
                      <View key={sub.id}
                        style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 38, paddingHorizontal: 14,
                          backgroundColor: colors.bgTint02,
                          borderBottomWidth: borderBottom, borderBottomColor: colors.border06 }}>
                        
                        {/* Checkbox for Subtask */}
                        <TouchableOpacity onPress={() => toggleTodoItem(sub, state, dispatch)}
                          style={{ paddingVertical: 10, paddingRight: 6 }}>
                          <View style={{ width: 16, height: 16, borderRadius: 5, borderWidth: 1.5,
                            borderColor: sub.done ? colors.foreground : colors.border20,
                            backgroundColor: sub.done ? colors.foreground : '#fff',
                            alignItems: 'center', justifyContent: 'center' }}>
                            {sub.done && <Icon name="check" size={9} color="#fff" strokeWidth={2.6} />}
                          </View>
                        </TouchableOpacity>

                        {/* Subtask Text/Row linking to parent detail sheet */}
                        <TouchableOpacity onPress={() => dispatch({ t: 'openTodoDetail', todo: td })}
                          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingLeft: 6 }}>
                          <Text style={{ fontFamily: 'Courier', fontSize: 11, color: colors.fg6, marginRight: 2 }}>└─</Text>
                          <Text style={{ fontSize: 13, fontWeight: '500', letterSpacing: -0.1,
                            textDecorationLine: sub.done ? 'line-through' : 'none',
                            color: sub.done ? colors.fg6 : colors.fg2, flex: 1 }}>{sub.text}</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </Card>
        </React.Fragment>
      ))}
    </ScrollView>
  );
}
