import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import type { UserId, CalEvent, Alarm, Todo, ModalKind, TabName, ActivityItem, Notification, FocusSession, ChatMessage, StartupDoc, ChatChannel } from './types';
import { USER_SLOTS } from './types';
import { supabase } from './supabase';
import type { DbNotification } from './supabase';
import { useRealtime } from './useRealtime';

export interface ProfileInfo {
  id?: string;
  displayName: string;
  shortId: UserId;
  roleLabel: string;
  tagline: string;
  avatarUrl?: string | null;
  preferences?: Record<string, string>;
}
export type ProfileMap = Partial<Record<UserId, ProfileInfo>>;

interface AppState {
  tab: TabName;
  viewer: UserId;
  mySlot: UserId | null;
  alarms: Alarm[];
  todos: Todo[];
  events: CalEvent[];
  activity: ActivityItem[];
  notifications: Notification[];
  focusSessions: FocusSession[];
  messages: ChatMessage[];
  docs: StartupDoc[];
  modal: ModalKind;
  showOnboarding: boolean;
  clock: Date;
  // auth
  session: Session | null;
  userId: string | null;
  householdId: string | null;
  householdName: string | null;
  householdAvatar: string | null;
  authReady: boolean;
  profiles: ProfileMap;
  channels: ChatChannel[];
  activeChannelId: string | null;
  userHouseholds: { id: string; name: string; avatarUrl?: string | null }[];
  profilesLoaded: boolean;
}

type Action =
  | { t: 'tab'; tab: TabName }
  | { t: 'setViewer'; u: UserId }
  | { t: 'openEvent'; ev: CalEvent }
  | { t: 'openAdd' }
  | { t: 'openNewAlarm' }
  | { t: 'openNewTodo'; initialStatus?: 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE'; initialText?: string }
  | { t: 'openTodoDetail'; todo: Todo }
  | { t: 'openNewDoc' }
  | { t: 'openDoc'; doc: StartupDoc }
  | { t: 'closeModal' }
  | { t: 'onboard' }
  | { t: 'finishOnboard' }
  | { t: 'toggleAlarm'; id: string; v: boolean }
  | { t: 'toggleTodo'; id: string }
  | { t: 'updateTodo'; id: string; updates: Partial<Todo> }
  | { t: 'addTodo'; todo: Omit<Todo, 'id' | 'done'> }
  | { t: 'addAlarm'; alarm: Omit<Alarm, 'id' | 'on'> }
  | { t: 'togglePriv'; v: boolean }
  | { t: 'rescheduleEvent'; id: string; start: string; end: string; day: string }
  | { t: 'tick'; clock: Date }
  | { t: 'setSession'; session: Session | null; userId: string | null }
  | { t: 'setHousehold'; householdId: string | null }
  | { t: 'setMySlot'; slot: UserId | null }
  | { t: 'setHouseholdMeta'; name: string | null; avatarUrl: string | null }
  | { t: 'setAuthReady' }
  | { t: 'setEvents'; events: CalEvent[] }
  | { t: 'setTodos'; todos: Todo[] }
  | { t: 'setAlarms'; alarms: Alarm[] }
  | { t: 'setActivity'; activity: ActivityItem[] }
  | { t: 'setNotifications'; notifications: Notification[] }
  | { t: 'setFocusSessions'; sessions: FocusSession[] }
  | { t: 'setMessages'; messages: ChatMessage[] }
  | { t: 'setDocs'; docs: StartupDoc[] }
  | { t: 'markNotifRead'; id: string }
  | { t: 'setProfiles'; profiles: ProfileMap }
  | { t: 'setChannels'; channels: ChatChannel[] }
  | { t: 'setActiveChannel'; channelId: string | null }
  | { t: 'openNewChannel' }
  | { t: 'setUserHouseholds'; households: { id: string; name: string; avatarUrl?: string | null }[] }
  | { t: 'setProfilesLoaded'; loaded: boolean }
  // Granular realtime actions
  | { t: 'upsertMessage'; msg: ChatMessage }
  | { t: 'deleteMessage'; id: string }
  | { t: 'upsertTodo'; todo: Todo }
  | { t: 'deleteTodo'; id: string }
  | { t: 'upsertEvent'; event: CalEvent }
  | { t: 'deleteEvent'; id: string }
  | { t: 'upsertDoc'; doc: StartupDoc }
  | { t: 'deleteDoc'; id: string }
  | { t: 'upsertChannel'; channel: ChatChannel }
  | { t: 'deleteChannel'; id: string };

const INITIAL_STATE: AppState = {
  tab: 'today',
  viewer: '1',
  mySlot: null,
  alarms: [],
  todos: [],
  events: [],
  activity: [],
  notifications: [],
  focusSessions: [],
  messages: [],
  docs: [],
  modal: null,
  showOnboarding: false,
  clock: new Date(),
  session: null,
  userId: null,
  householdId: null,
  householdName: null,
  householdAvatar: null,
  authReady: false,
  profiles: {},
  channels: [],
  activeChannelId: null,
  userHouseholds: [],
  profilesLoaded: false,
};


function reducer(s: AppState, a: Action): AppState {
  switch (a.t) {
    case 'tab':           return { ...s, tab: a.tab, modal: null, activeChannelId: null };
    case 'setViewer':     return { ...s, viewer: a.u };
    case 'openEvent':     return { ...s, modal: { kind: 'event', ev: a.ev } };
    case 'openAdd':       return { ...s, modal: { kind: 'addEvent' } };
    case 'openNewAlarm':  return { ...s, modal: { kind: 'addAlarm' } };
    case 'openNewTodo':   return { ...s, modal: { kind: 'addTodo', initialStatus: a.initialStatus, initialText: a.initialText } };
    case 'openTodoDetail': return { ...s, modal: { kind: 'todoDetail', todo: a.todo } };
    case 'openNewDoc':    return { ...s, modal: { kind: 'addDoc' } };
    case 'openDoc':       return { ...s, modal: { kind: 'doc', doc: a.doc } };
    case 'closeModal':    return { ...s, modal: null };
    case 'onboard':       return { ...s, showOnboarding: true };
    case 'finishOnboard': return { ...s, showOnboarding: false };
    case 'toggleAlarm':   return { ...s, alarms: s.alarms.map(al => al.id === a.id ? { ...al, on: a.v } : al) };
    case 'toggleTodo':    return {
      ...s,
      todos: s.todos.map(td => td.id === a.id ? { ...td, done: !td.done, status: !td.done ? 'DONE' : 'TODO' } : td)
    };
    case 'updateTodo':    return {
      ...s,
      todos: s.todos.map(td => td.id === a.id ? { ...td, ...a.updates } : td),
      modal: s.modal?.kind === 'todoDetail' && s.modal.todo.id === a.id
        ? { kind: 'todoDetail', todo: { ...s.modal.todo, ...a.updates } }
        : s.modal,
    };
    case 'addTodo':       return {
      ...s,
      todos: [{
        id: 'tn' + Date.now(),
        done: false,
        status: 'TODO',
        projectName: 'General',
        notes: '',
        ...(a.todo as any)
      } as Todo, ...s.todos],
      modal: null,
    };
    case 'addAlarm':      return {
      ...s,
      alarms: [{ id: 'an' + Date.now(), on: true, who: s.viewer, ...a.alarm, days: a.alarm.days || 'EVERY DAY' } as Alarm, ...s.alarms],
      modal: null,
    };
    case 'togglePriv': {
      if (s.modal?.kind !== 'event') return s;
      return { ...s, modal: { ...s.modal, ev: { ...s.modal.ev, priv: a.v } } };
    }
    case 'rescheduleEvent': {
      const updateEvent = (ev: CalEvent): CalEvent =>
        ev.id === a.id ? { ...ev, start: a.start, end: a.end, day: a.day } : ev;
      return {
        ...s,
        events: s.events.map(updateEvent),
        modal: s.modal?.kind === 'event' && s.modal.ev.id === a.id
          ? { kind: 'event', ev: updateEvent(s.modal.ev) }
          : s.modal,
      };
    }
    case 'tick':               return { ...s, clock: a.clock };
    case 'setSession':         return { ...s, session: a.session, userId: a.userId };
    case 'setHousehold': {
      if (a.householdId === null) {
        return {
          ...s,
          householdId: null,
          householdName: null,
          householdAvatar: null,
          mySlot: null,
          profilesLoaded: false,
          alarms: [],
          todos: [],
          events: [],
          activity: [],
          notifications: [],
          focusSessions: [],
          messages: [],
          docs: [],
          profiles: {},
          channels: [],
          activeChannelId: null,
          userHouseholds: [],
        };
      }
      return { ...s, householdId: a.householdId };
    }
    case 'setMySlot':         return { ...s, mySlot: a.slot, viewer: a.slot ?? s.viewer };
    case 'setHouseholdMeta':  return { ...s, householdName: a.name, householdAvatar: a.avatarUrl };
    case 'setUserHouseholds':  return { ...s, userHouseholds: a.households };
    case 'setProfilesLoaded':  return { ...s, profilesLoaded: a.loaded };


    case 'setAuthReady':       return { ...s, authReady: true };
    case 'setEvents':          return { ...s, events: a.events };
    case 'setTodos':           return { ...s, todos: a.todos };
    case 'setAlarms':          return { ...s, alarms: a.alarms };
    case 'setActivity':        return { ...s, activity: a.activity };
    case 'setNotifications':   return { ...s, notifications: a.notifications };
    case 'setFocusSessions': {
      const mapped = a.sessions.map((fs: any) => {
        const match = Object.entries(s.profiles).find(([_, prof]) => prof.id === fs.owner_id);
        const ownerSlot = match ? (match[0] as UserId) : '1';
        return {
          id: fs.id,
          ownerId: fs.owner_id,
          ownerSlot,
          label: fs.label,
          durationMin: fs.duration_min,
          startedAt: fs.started_at,
          endedAt: fs.ended_at,
        };
      });
      return { ...s, focusSessions: mapped };
    }
    case 'setMessages':        return { ...s, messages: a.messages };
    case 'setDocs':            return { ...s, docs: a.docs };
    case 'markNotifRead':      return { ...s, notifications: s.notifications.map(n => n.id === a.id ? { ...n, read: true } : n) };
    case 'setProfiles':        return { ...s, profiles: a.profiles };
    case 'setChannels':        return { ...s, channels: a.channels };
    case 'setActiveChannel':   return { ...s, activeChannelId: a.channelId };
    case 'openNewChannel':     return { ...s, modal: { kind: 'addChannel' } };
    // Granular realtime actions — instant, no re-fetch
    case 'upsertMessage': {
      const exists = s.messages.some(m => m.id === a.msg.id);
      return { ...s, messages: exists
        ? s.messages.map(m => m.id === a.msg.id ? a.msg : m)
        : [...s.messages, a.msg].sort((a, b) => (a.createdAt ?? '') < (b.createdAt ?? '') ? -1 : 1)
      };
    }
    case 'deleteMessage':      return { ...s, messages: s.messages.filter(m => m.id !== a.id) };
    case 'upsertTodo': {
      const exists = s.todos.some(t => t.id === a.todo.id);
      return { ...s, todos: exists
        ? s.todos.map(t => t.id === a.todo.id ? a.todo : t)
        : [a.todo, ...s.todos]
      };
    }
    case 'deleteTodo':         return { ...s, todos: s.todos.filter(t => t.id !== a.id) };
    case 'upsertEvent': {
      const exists = s.events.some(e => e.id === a.event.id);
      return { ...s, events: exists
        ? s.events.map(e => e.id === a.event.id ? a.event : e)
        : [...s.events, a.event]
      };
    }
    case 'deleteEvent':        return { ...s, events: s.events.filter(e => e.id !== a.id) };
    case 'upsertDoc': {
      const exists = s.docs.some(d => d.id === a.doc.id);
      return { ...s, docs: exists
        ? s.docs.map(d => d.id === a.doc.id ? a.doc : d)
        : [a.doc, ...s.docs]
      };
    }
    case 'deleteDoc':          return { ...s, docs: s.docs.filter(d => d.id !== a.id) };
    case 'upsertChannel': {
      const exists = s.channels.some(c => c.id === a.channel.id);
      return { ...s, channels: exists
        ? s.channels.map(c => c.id === a.channel.id ? a.channel : c)
        : [...s.channels, a.channel]
      };
    }
    case 'deleteChannel':      return {
      ...s,
      channels: s.channels.filter(c => c.id !== a.id),
      activeChannelId: s.activeChannelId === a.id ? null : s.activeChannelId,
    };
    default: return s;
  }
}

const StoreContext = createContext<{ state: AppState; dispatch: React.Dispatch<Action>; refresh: () => Promise<void> } | null>(null);

// Helper: write an activity row + optional notification to Supabase
export async function writeActivity(
  householdId: string,
  actorId: string,
  actorSlot: UserId,
  verb: string,
  obj: string,
  badge: string,
  notif?: { title: string; body: string; forUser: UserId | 'B'; urgent?: boolean }
) {
  await supabase.from('activity').insert({
    household_id: householdId,
    actor_id:     actorId,
    actor_short:  actorSlot,
    verb,
    obj,
    badge,
  });
  if (notif) {
    await supabase.from('notifications').insert({
      household_id: householdId,
      for_user:     notif.forUser,
      kind:         badge,
      title:        notif.title,
      body:         notif.body,
      urgent:       notif.urgent ?? false,
    });
  }
}

function dbNotif(r: DbNotification): Notification {
  return {
    id:     r.id,
    when:   new Date(r.created_at).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false }),
    kind:   r.kind,
    title:  r.title,
    body:   r.body,
    urgent: r.urgent,
    read:   r.is_read,
  };
}

function RealtimeBridge({ householdId, dispatch, refreshRef }: { householdId: string | null; dispatch: React.Dispatch<Action>; refreshRef: React.MutableRefObject<() => Promise<void>> }) {
  const onEvents        = useCallback((evs: CalEvent[])      => dispatch({ t: 'setEvents',        events: evs }),        [dispatch]);
  const onTodos         = useCallback((ts: Todo[])            => dispatch({ t: 'setTodos',         todos: ts }),          [dispatch]);
  const onAlarms        = useCallback((as: Alarm[])           => dispatch({ t: 'setAlarms',        alarms: as }),         [dispatch]);
  const onActivity      = useCallback((a: ActivityItem[])     => dispatch({ t: 'setActivity',      activity: a }),        [dispatch]);
  const onNotifications = useCallback((ns: DbNotification[])  => dispatch({ t: 'setNotifications', notifications: ns.map(dbNotif) }), [dispatch]);
  const onMessages      = useCallback((msgs: ChatMessage[])   => dispatch({ t: 'setMessages',       messages: msgs }),      [dispatch]);
  const onDocs          = useCallback((docs: StartupDoc[])   => dispatch({ t: 'setDocs',           docs: docs }),          [dispatch]);
  const onChannels      = useCallback((chans: ChatChannel[])  => dispatch({ t: 'setChannels',      channels: chans }),     [dispatch]);
  const onFocusSessions = useCallback((sessions: any[])      => dispatch({ t: 'setFocusSessions', sessions }),           [dispatch]);

  // Granular realtime handlers
  const onUpsertMessage  = useCallback((msg: ChatMessage)     => dispatch({ t: 'upsertMessage', msg }),    [dispatch]);
  const onDeleteMessage  = useCallback((id: string)           => dispatch({ t: 'deleteMessage', id }),     [dispatch]);
  const onUpsertTodo     = useCallback((todo: Todo)           => dispatch({ t: 'upsertTodo', todo }),       [dispatch]);
  const onDeleteTodo     = useCallback((id: string)           => dispatch({ t: 'deleteTodo', id }),         [dispatch]);
  const onUpsertEvent    = useCallback((event: CalEvent)      => dispatch({ t: 'upsertEvent', event }),     [dispatch]);
  const onDeleteEvent    = useCallback((id: string)           => dispatch({ t: 'deleteEvent', id }),        [dispatch]);
  const onUpsertDoc      = useCallback((doc: StartupDoc)      => dispatch({ t: 'upsertDoc', doc }),         [dispatch]);
  const onDeleteDoc      = useCallback((id: string)           => dispatch({ t: 'deleteDoc', id }),          [dispatch]);
  const onUpsertChannel  = useCallback((channel: ChatChannel) => dispatch({ t: 'upsertChannel', channel }), [dispatch]);
  const onDeleteChannel  = useCallback((id: string)           => dispatch({ t: 'deleteChannel', id }),      [dispatch]);

  const { refresh } = useRealtime({
    householdId,
    onEvents, onTodos, onAlarms, onActivity, onNotifications, onMessages, onDocs, onChannels, onFocusSessions,
    onUpsertMessage, onDeleteMessage,
    onUpsertTodo, onDeleteTodo,
    onUpsertEvent, onDeleteEvent,
    onUpsertDoc, onDeleteDoc,
    onUpsertChannel, onDeleteChannel,
  });
  refreshRef.current = refresh;
  return null;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const refreshRef = React.useRef<() => Promise<void>>(async () => {});

  // Clock tick
  useEffect(() => {
    const id = setInterval(() => dispatch({ t: 'tick', clock: new Date() }), 60_000);
    return () => clearInterval(id);
  }, []);

  // Auth state
  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data }) => {
        dispatch({ t: 'setSession', session: data.session, userId: data.session?.user.id ?? null });
      })
      .catch(() => {})
      .finally(() => {
        dispatch({ t: 'setAuthReady' });
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      dispatch({ t: 'setSession', session, userId: session?.user.id ?? null });
      if (!session) dispatch({ t: 'setHousehold', householdId: null });
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  // Load household + all profiles for current user + listen to profile changes in real-time
  useEffect(() => {
    if (!state.userId) return;

    const fetchProfiles = async () => {
      try {
        const { data: me } = await supabase
          .from('profiles')
          .select('id, active_household_id, display_name, preferences')
          .eq('id', state.userId)
          .single();
        if (!me) return;

        // Fetch memberships to find all households this user is in
        const { data: memberships } = await supabase
          .from('household_members')
          .select('household_id, households(name, avatar_url)')
          .eq('user_id', state.userId);

        const userHouseholds = (memberships ?? []).map((m: any) => ({
          id: m.household_id,
          name: m.households?.name ?? 'Household',
          avatarUrl: m.households?.avatar_url ?? null,
        }));
        // Dispatch setHousehold FIRST (may clear userHouseholds if null),
        // then setUserHouseholds to repopulate — HouseholdScreen needs the list
        // even when active_household_id is null (to show the "Welcome back" picker).
        dispatch({ t: 'setHousehold', householdId: me.active_household_id });
        dispatch({ t: 'setUserHouseholds', households: userHouseholds });

        if (!me.active_household_id) {
          dispatch({ t: 'setProfiles', profiles: {} });
          return;
        }


        // Fetch household details (name + avatar)
        const { data: hhData } = await supabase
          .from('households')
          .select('name, avatar_url')
          .eq('id', me.active_household_id)
          .single();
        dispatch({ t: 'setHouseholdMeta', name: hhData?.name ?? null, avatarUrl: hhData?.avatar_url ?? null });

        // Fetch user's viewer short ID for this household
        const { data: currentMember } = await supabase
          .from('household_members')
          .select('short_id')
          .eq('user_id', state.userId)
          .eq('household_id', me.active_household_id)
          .single();

        if (currentMember) {
          dispatch({ t: 'setMySlot', slot: currentMember.short_id as UserId });
        }

        // Fetch all profiles in this active household
        const { data: all } = await supabase
          .from('household_members')
          .select('user_id, short_id, role_label, tagline, profiles(display_name, preferences, avatar_url)')
          .eq('household_id', me.active_household_id);

        if (!all) return;

        const map: ProfileMap = {};
        all.forEach((m: any) => {
          map[m.short_id as UserId] = {
            id:           m.user_id,
            displayName:  m.profiles?.display_name ?? 'N/A',
            shortId:      m.short_id as UserId,
            roleLabel:    m.role_label ?? '',
            tagline:      m.tagline ?? '',
            avatarUrl:    m.profiles?.avatar_url ?? null,
            preferences:  m.profiles?.preferences ?? undefined,
          };
        });
        dispatch({ t: 'setProfiles', profiles: map });
      } catch (err) {
        // Safe catch
      } finally {
        dispatch({ t: 'setProfilesLoaded', loaded: true });
      }
    };

    fetchProfiles();

    // Subscribe to changes on profiles and memberships
    const channel = supabase
      .channel(`profiles-user:${state.userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${state.userId}` }, fetchProfiles)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'household_members' }, fetchProfiles)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [state.userId]);




  // Persist alarm toggles to Supabase
  const prevAlarms = React.useRef(state.alarms);
  useEffect(() => {
    if (!state.householdId) { prevAlarms.current = state.alarms; return; }
    const prev = prevAlarms.current;
    state.alarms.forEach(al => {
      const old = prev.find(p => p.id === al.id);
      if (old && old.on !== al.on) {
        supabase.from('alarms').update({ is_on: al.on }).eq('id', al.id);
      }
    });
    prevAlarms.current = state.alarms;
  }, [state.alarms]);

  const refresh = useCallback(() => refreshRef.current(), []);

  return (
    <StoreContext.Provider value={{ state, dispatch, refresh }}>
      <RealtimeBridge householdId={state.householdId} dispatch={dispatch} refreshRef={refreshRef} />
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be inside StoreProvider');
  return ctx;
}

export function useRefresh() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useRefresh must be inside StoreProvider');
  return ctx.refresh;
}

export async function toggleTodoItem(
  todo: Todo,
  state: any,
  dispatch: React.Dispatch<any>
) {
  const nextDone = !todo.done;

  // Prevent parent task completion if there are uncompleted subtasks
  if (!todo.parentId && nextDone) {
    const subtasks = (state.todos || []).filter((t: Todo) => t.parentId === todo.id);
    const hasUncompleted = subtasks.some((t: Todo) => !t.done);
    if (hasUncompleted) {
      Alert.alert(
        "Outstanding Subtasks",
        "You must complete all subtasks before completing the main task."
      );
      return;
    }
  }

  // Optimistically toggle locally for instant responsive feel
  dispatch({ t: 'toggleTodo', id: todo.id });
  
  // Persist to Supabase
  await supabase.from('todos').update({
    is_done: nextDone,
    status: nextDone ? 'DONE' : 'TODO'
  }).eq('id', todo.id);
  
  // Log activity and notify
  if (state.userId && state.householdId) {
    const actorName = state.profiles[state.viewer]?.displayName ?? 'Someone';
    await writeActivity(
      state.householdId,
      state.userId,
      state.viewer,
      nextDone ? 'completed' : 'unchecked',
      todo.text,
      'todo',
      todo.shared ? {
        title: nextDone ? `${actorName} completed a task` : `${actorName} unchecked a task`,
        body: `"${todo.text}"`,
        forUser: 'B'
      } : undefined
    );
  }
}

export async function updateTodoItemDetails(
  todo: Todo,
  updates: {
    text?: string;
    status?: 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE';
    projectName?: string;
    notes?: string;
    estimatedHours?: number | null;
    due?: string;
  },
  state: any,
  dispatch: React.Dispatch<any>
) {
  // Optimistically update locally
  dispatch({ t: 'updateTodo', id: todo.id, updates });

  // Map updates to Supabase schema columns
  const dbUpdates: any = {};
  if (updates.text !== undefined) dbUpdates.text = updates.text;
  if (updates.projectName !== undefined) dbUpdates.project_name = updates.projectName;
  if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
  if (updates.estimatedHours !== undefined) dbUpdates.estimated_hours = updates.estimatedHours;
  if (updates.due !== undefined) dbUpdates.due_label = updates.due;
  if (updates.status !== undefined) {
    dbUpdates.status = updates.status;
    dbUpdates.is_done = updates.status === 'DONE';
  }

  // Persist to Supabase
  await supabase.from('todos').update(dbUpdates).eq('id', todo.id);

  // If status changed, log activity and notify
  if (updates.status !== undefined && updates.status !== todo.status && state.userId && state.householdId) {
    const statusLabels = {
      TODO: 'To Do',
      IN_PROGRESS: 'In Progress',
      BLOCKED: 'Blocked',
      DONE: 'Done',
    };
    const newStatusLabel = statusLabels[updates.status];
    const actorName = state.profiles[state.viewer]?.displayName ?? 'Someone';
    await writeActivity(
      state.householdId,
      state.userId,
      state.viewer,
      'moved to ' + newStatusLabel.toLowerCase(),
      todo.text,
      'todo',
      todo.shared ? {
        title: `${actorName} moved a task`,
        body: `"${todo.text}" moved to ${newStatusLabel}`,
        forUser: 'B'
      } : undefined
    );
  }
}
