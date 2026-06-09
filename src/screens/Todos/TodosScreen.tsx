import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { useStore, toggleTodoItem, updateTodoItemDetails } from '../../lib/store';
import { colors, SLOT_COLORS } from '../../lib/tokens';
import { USERS } from '../../data/seed';
import { ScreenHeader, Card, CardAlt, SecLabel, UserChip, AppSwitch, IconBtn, styles } from '../../components/Primitives';
import { Icon } from '../../components/Icon';
import type { Todo } from '../../lib/types';
import Svg, { Circle } from 'react-native-svg';

const { width: screenWidth } = Dimensions.get('window');
const COLUMN_WIDTH = screenWidth * 0.82; // 82% width allows peeking at the next column

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

  const viewer = state.viewer;
  const all = state.todos;

  const prefs = state.profiles[viewer]?.preferences as Record<string, string> | undefined ?? {};
  const defaultTodoView = (prefs.defaultTodoView === 'Board' ? 'BOARD' : 'LIST');

  const [viewMode, setViewMode] = useState<'LIST' | 'BOARD'>(defaultTodoView);
  const [showDone, setShowDone] = useState(false);
  const [justMe, setJustMe] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  // Sync with preferences if it changes (e.g. from profile settings tab)
  React.useEffect(() => {
    setViewMode(defaultTodoView);
  }, [defaultTodoView]);

  // Extract unique active project names from all current todos
  const projectFolders = Array.from(
    new Set(all.map(t => t.projectName).filter((name): name is string => !!name))
  );

  // Filter tasks based on Shared/Mine tab, Just Me filter, and Selected Project Filter
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
  }).filter(t => {
    if (selectedProject) {
      return t.projectName?.toLowerCase() === selectedProject.toLowerCase();
    }
    return true;
  });

  // Buckets filtering (specifically hides completed tasks if showDone is false)
  const listFiltered = filtered.filter(t => showDone || !t.done);

  const openCount = filtered.filter(t => t.status !== 'DONE' && !t.done).length;
  const doneToday = all.filter(t => t.done || t.status === 'DONE').length;

  const buckets: Record<string, Todo[]> = {};
  listFiltered.forEach(t => {
    if (!buckets[t.due]) buckets[t.due] = [];
    buckets[t.due].push(t);
  });
  const ordered = BUCKET_ORDER.filter(k => buckets[k]);

  // Grouping tasks for Kanban Lanes
  const lanes = {
    TODO: filtered.filter(t => t.status === 'TODO' || (!t.status && !t.done)),
    IN_PROGRESS: filtered.filter(t => t.status === 'IN_PROGRESS'),
    BLOCKED: filtered.filter(t => t.status === 'BLOCKED'),
    DONE: filtered.filter(t => t.status === 'DONE' || (!t.status && t.done)),
  };

  // Kanban helpers
  function prevStatus(s: 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE'): 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' {
    if (s === 'IN_PROGRESS') return 'TODO';
    if (s === 'BLOCKED') return 'IN_PROGRESS';
    if (s === 'DONE') return 'BLOCKED';
    return 'TODO';
  }

  function nextStatus(s: 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE'): 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' {
    if (s === 'TODO') return 'IN_PROGRESS';
    if (s === 'IN_PROGRESS') return 'BLOCKED';
    if (s === 'BLOCKED') return 'DONE';
    return 'DONE';
  }

  async function handleQuickMove(todo: Todo, targetStatus: 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE') {
    await updateTodoItemDetails(todo, { status: targetStatus }, state, dispatch);
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 18, paddingBottom: 130 }}>
      <ScreenHeader
        eyebrow={`TO-DOS · ${openCount} OPEN · ${doneToday} DONE TODAY`}
        title="Take"
        ghost="the small stuff off your mind."
        sub="Shared lives in the house. Yours stays yours."
        right={
          <IconBtn inv onPress={() => dispatch({ t: 'openNewTodo', initialStatus: 'TODO' })}>
            <Icon name="plus" size={18} color="#fff" />
          </IconBtn>
        }
      />

      {/* Tab pills */}
      <Card style={{ padding: 4, marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {([
            { id: 'SHARED', label: 'Shared', count: all.filter(t => t.shared && !t.done && t.status !== 'DONE').length },
            { id: 'MINE',   label: 'Mine',   count: all.filter(t => t.who === viewer && !t.done && t.status !== 'DONE').length },
            { id: 'ALL',    label: 'All',    count: all.filter(t => !t.done && t.status !== 'DONE').length },
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

      {/* View Toggle + Filter Controls */}
      <View style={[styles.between, { marginBottom: 18, paddingHorizontal: 4, flexWrap: 'wrap', gap: 10 }]}>
        {/* Left Side: View Toggle */}
        <View style={[styles.row, { gap: 4, backgroundColor: colors.bgTint04, padding: 3, borderRadius: 10 }]}>
          {(['LIST', 'BOARD'] as const).map(mode => (
            <TouchableOpacity key={mode} onPress={() => setViewMode(mode)}
              style={{
                paddingHorizontal: 12, height: 28, borderRadius: 8, justifyContent: 'center',
                backgroundColor: viewMode === mode ? colors.foreground : 'transparent'
              }}>
              <Text style={{ fontFamily: 'Courier', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '700',
                color: viewMode === mode ? '#fff' : colors.fg3 }}>
                {mode === 'LIST' ? 'List' : 'Board'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Right Side: Quick Filters */}
        <View style={[styles.row, { gap: 14 }]}>
          <View style={[styles.row, { gap: 6 }]}>
            <Text style={{ fontFamily: 'Courier', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.8, color: colors.fg5 }}>JUST ME</Text>
            <AppSwitch value={justMe} onChange={setJustMe} />
          </View>
          {viewMode === 'LIST' && (
            <View style={[styles.row, { gap: 6 }]}>
              <Text style={{ fontFamily: 'Courier', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.8, color: colors.fg5 }}>SHOW DONE</Text>
              <AppSwitch value={showDone} onChange={setShowDone} />
            </View>
          )}
        </View>
      </View>

      {/* Project Filter Scroll Strip */}
      {projectFolders.length > 0 && (
        <View style={{ marginBottom: 16, paddingHorizontal: 2 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {/* "All" button */}
            <TouchableOpacity
              onPress={() => setSelectedProject(null)}
              style={{
                height: 28, paddingHorizontal: 12, borderRadius: 9999, justifyContent: 'center',
                backgroundColor: selectedProject === null ? colors.foreground : colors.bgTint04,
                borderWidth: 1, borderColor: selectedProject === null ? colors.foreground : colors.border08
              }}
            >
              <Text style={{ fontFamily: 'Courier', fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1,
                color: selectedProject === null ? '#fff' : colors.fg3 }}>
                📂 All Projects
              </Text>
            </TouchableOpacity>
            {/* Folder buttons */}
            {projectFolders.map(pName => {
              const active = selectedProject === pName;
              return (
                <TouchableOpacity
                  key={pName}
                  onPress={() => setSelectedProject(pName)}
                  style={{
                    height: 28, paddingHorizontal: 12, borderRadius: 9999, justifyContent: 'center',
                    backgroundColor: active ? colors.foreground : colors.bgTint04,
                    borderWidth: 1, borderColor: active ? colors.foreground : colors.border08
                  }}
                >
                  <Text style={{ fontFamily: 'Courier', fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1,
                    color: active ? '#fff' : colors.fg3 }}>
                    📁 {pName}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Main View Area */}
      {viewMode === 'BOARD' ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12, paddingBottom: 50, paddingHorizontal: 2 }}
          snapToInterval={COLUMN_WIDTH + 12}
          decelerationRate="fast"
        >
          {([
            { key: 'TODO', label: 'To Do', accent: '#7A7A7A' },
            { key: 'IN_PROGRESS', label: 'In Progress', accent: '#CA8A04' },
            { key: 'BLOCKED', label: 'Blocked', accent: '#DC2626' },
            { key: 'DONE', label: 'Done', accent: '#141414' }
          ] as const).map(lane => {
            const laneTasks = lanes[lane.key];
            return (
              <View key={lane.key}
                style={{
                  width: COLUMN_WIDTH,
                  backgroundColor: colors.bgTint02,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: colors.border08,
                  padding: 12,
                  minHeight: 480
                }}>
                {/* Lane Header */}
                <View style={[styles.between, { marginBottom: 12, paddingHorizontal: 4 }]}>
                  <View style={[styles.row, { gap: 8 }]}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: lane.accent }} />
                    <Text style={{ fontFamily: 'Courier', fontWeight: 'bold', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5, color: colors.fg1 }}>
                      {lane.label}
                    </Text>
                    <Text style={{ fontFamily: 'Courier', fontSize: 10, color: colors.fg5 }}>· {laneTasks.length}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => dispatch({ t: 'openNewTodo', initialStatus: lane.key })}
                    style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: colors.bgTint05, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Icon name="plus" size={12} color={colors.fg2} />
                  </TouchableOpacity>
                </View>

                {/* Lane Cards Scrollable */}
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                  {laneTasks.length === 0 ? (
                    <View style={{ padding: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border12, borderRadius: 16, marginTop: 10 }}>
                      <Text style={{ fontSize: 10, color: colors.fg6, fontFamily: 'Courier', textTransform: 'uppercase', letterSpacing: 1.2 }}>Empty Lane</Text>
                    </View>
                  ) : (
                    laneTasks.map(td => {
                      const subtasks = all.filter(sub => sub.parentId === td.id);
                      const subCount = subtasks.length;
                      const subDone = subtasks.filter(sub => sub.done).length;

                      // Priority badge styling
                      const priBg = td.p === 1 ? '#FEE2E2' : td.p === 2 ? '#FEF3C7' : '#F3F4F6';
                      const priBorder = td.p === 1 ? '#EF4444' : td.p === 2 ? '#F59E0B' : '#9CA3AF';
                      const priText = td.p === 1 ? 'HIGH' : td.p === 2 ? 'MED' : 'LOW';

                      return (
                        <Card key={td.id} style={{ padding: 12, borderColor: colors.border06 }}>
                          <TouchableOpacity onPress={() => dispatch({ t: 'openTodoDetail', todo: td })} activeOpacity={0.75}>
                            {/* Card Header: Project tag + Priority badge */}
                            <View style={[styles.between, { marginBottom: 8 }]}>
                              <View style={[styles.row, { gap: 4, backgroundColor: colors.bgTint04, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 }]}>
                                <Text style={{ fontFamily: 'Courier', fontSize: 8.5, fontWeight: '700', color: colors.fg3 }}>
                                  🏷️ {td.projectName?.toUpperCase() || 'GENERAL'}
                                </Text>
                              </View>
                              <View style={{ backgroundColor: priBg, borderWidth: 0.5, borderColor: priBorder, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                <Text style={{ fontSize: 7.5, fontWeight: '900', letterSpacing: 0.5, color: priBorder }}>
                                  {priText}
                                </Text>
                              </View>
                            </View>

                            {/* Task text */}
                            <Text style={{ fontSize: 14, fontWeight: '700', letterSpacing: -0.1, color: td.done || lane.key === 'DONE' ? colors.fg6 : colors.fg1, textDecorationLine: td.done || lane.key === 'DONE' ? 'line-through' : 'none' }}>
                              {td.text}
                            </Text>

                            {/* Workload and subtasks indicators */}
                            {(td.estimatedHours !== undefined || subCount > 0) && (
                              <View style={[styles.row, { gap: 10, marginTop: 8 }]}>
                                {td.estimatedHours !== undefined && td.estimatedHours !== null && (
                                  <View style={[styles.row, { gap: 3 }]}>
                                    <Text style={{ fontSize: 10 }}>⏱️</Text>
                                    <Text style={{ fontSize: 9.5, fontFamily: 'Courier', color: colors.fg5 }}>{td.estimatedHours}h</Text>
                                  </View>
                                )}
                                {subCount > 0 && (
                                  <View style={[styles.row, { gap: 3 }]}>
                                    <Text style={{ fontSize: 10 }}>☑️</Text>
                                    <Text style={{ fontSize: 9.5, fontFamily: 'Courier', color: colors.fg5 }}>{subDone}/{subCount}</Text>
                                  </View>
                                )}
                              </View>
                            )}

                            {/* Card Footer: Assignees & Quick Navigation */}
                            <View style={[styles.between, { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border04 }]}>
                              {/* Stacked User Chips */}
                              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                {td.assignedTo && td.assignedTo.length > 0 ? (
                                  <View style={{ flexDirection: 'row' }}>
                                    {td.assignedTo.map((uid, idx) => (
                                      <View key={uid} style={{ marginLeft: idx > 0 ? -6 : 0, zIndex: 10 - idx }}>
                                        <UserChip id={uid} />
                                      </View>
                                    ))}
                                  </View>
                                ) : (
                                  <Text style={{ fontSize: 9, fontFamily: 'Courier', color: colors.fg6 }}>UNASSIGNED</Text>
                                )}
                              </View>

                              {/* Instantly slide items between lanes */}
                              <View style={[styles.row, { gap: 4 }]}>
                                {lane.key !== 'TODO' && (
                                  <TouchableOpacity
                                    onPress={() => handleQuickMove(td, prevStatus(lane.key))}
                                    style={{ width: 22, height: 22, borderRadius: 5, backgroundColor: colors.bgTint05, alignItems: 'center', justifyContent: 'center' }}
                                  >
                                    <Icon name="chevLeft" size={10} color={colors.fg3} />
                                  </TouchableOpacity>
                                )}
                                {lane.key !== 'DONE' && (
                                  <TouchableOpacity
                                    onPress={() => handleQuickMove(td, nextStatus(lane.key))}
                                    style={{ width: 22, height: 22, borderRadius: 5, backgroundColor: colors.bgTint05, alignItems: 'center', justifyContent: 'center' }}
                                  >
                                    <Icon name="chev" size={10} color={colors.fg3} />
                                  </TouchableOpacity>
                                )}
                              </View>
                            </View>
                          </TouchableOpacity>
                        </Card>
                      );
                    })
                  )}
                </ScrollView>
              </View>
            );
          })}
        </ScrollView>
      ) : (
        /* Original Standard List View */
        <>
          {ordered.length === 0 && (
            <CardAlt style={{ alignItems: 'center', padding: 32, marginBottom: 22 }}>
              <Text style={{ fontWeight: '900', fontSize: 28, letterSpacing: -1, lineHeight: 33 }}>
                Clean. <Text style={{ color: colors.fg9 }}>Nothing to do.</Text>
              </Text>
              <Text style={{ fontFamily: 'Courier', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.8, color: colors.fg5, marginTop: 12 }}>
                ENJOY THE QUIET, OR ADD SOMETHING.
              </Text>
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
                            borderColor: td.done || td.status === 'DONE' ? colors.foreground : colors.border20,
                            backgroundColor: td.done || td.status === 'DONE' ? colors.foreground : '#fff',
                            alignItems: 'center', justifyContent: 'center' }}>
                            {(td.done || td.status === 'DONE') && <Icon name="check" size={12} color="#fff" strokeWidth={2.4} />}
                          </View>
                        </TouchableOpacity>

                        {/* Rest of row: opens To-do Details Sheet */}
                        <TouchableOpacity onPress={() => dispatch({ t: 'openTodoDetail', todo: td })}
                          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingLeft: 6 }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontWeight: '700', letterSpacing: -0.1,
                              textDecorationLine: td.done || td.status === 'DONE' ? 'line-through' : 'none',
                              color: td.done || td.status === 'DONE' ? colors.fg6 : colors.fg1 }}>{td.text}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                              <Text style={{ fontFamily: 'Courier', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.6, color: colors.fg5 }}>
                                {td.projectName ? `${td.projectName.toUpperCase()} · ` : ''}{td.shared ? 'SHARED' : 'PERSONAL'} · P{td.p}
                                {subCount > 0 && ` · SUBTASKS: ${subDone}/${subCount}`}
                                {td.estimatedHours !== undefined && td.estimatedHours !== null && ` · ⏱️ ${td.estimatedHours}H`}
                                {td.status && td.status !== 'TODO' && ` · STATUS: ${td.status.replace('_', ' ')}`}
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
        </>
      )}
    </ScrollView>
  );
}
