import { useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import type { DbEvent, DbTodo, DbAlarm, DbActivity, DbNotification, DbChannel } from './supabase';
import type { UserId, CalEvent, Todo, Alarm, ActivityItem, ChatMessage, StartupDoc, ChatChannel } from './types';

interface DbMessage {
  id: string;
  household_id: string;
  sender_id: string | null;
  sender_short: string;
  content: string;
  is_system: boolean;
  channel_id: string | null;
  created_at: string;
  reply_to_id: string | null;
  reply_to_content: string | null;
  reply_to_sender: string | null;
  is_edited: boolean;
  original_content: string | null;
}

interface DbDoc {
  id: string;
  household_id: string;
  title: string;
  content: string;
  tags: string[];
  attachments?: any[];
  created_by: string | null;
  is_favorite?: boolean;
  created_at: string;
  updated_at: string;
}

export function dbEvent(r: DbEvent): CalEvent {
  return {
    id: r.id,
    start: r.start_time.slice(0, 5),
    end: r.end_time.slice(0, 5),
    title: r.title,
    loc: r.location,
    who: r.who as UserId | 'B',
    priv: r.is_private,
    day: r.event_date,
    reminderOffsetMin: r.reminder_offset_min ?? null,
  };
}

export function dbTodo(r: DbTodo): Todo {
  return {
    id: r.id,
    text: r.text,
    who: (r.short_id ?? '1') as UserId,
    shared: r.is_shared,
    sharedWith: Array.isArray(r.shared_with) && r.shared_with.length > 0 ? r.shared_with as UserId[] : null,
    done: r.is_done,
    due: r.due_label,
    p: r.priority as 1 | 2 | 3,
    assignedTo: Array.isArray(r.assigned_to) && r.assigned_to.length > 0 ? r.assigned_to as UserId[] : null,
    parentId: r.parent_id,
    status: (r.status as any) ?? (r.is_done ? 'DONE' : 'TODO'),
    projectName: r.project_name ?? 'General',
    notes: r.notes ?? '',
    estimatedHours: r.estimated_hours ?? undefined,
  };
}

function dbAlarm(r: DbAlarm): Alarm {
  return {
    id: r.id,
    time: r.alarm_time.slice(0, 5),
    label: r.label,
    days: r.days_label,
    on: r.is_on,
    shared: r.is_shared,
    who: r.short_id as UserId | undefined,
    sound: r.sound,
  };
}

export function dbMessage(r: DbMessage): ChatMessage {
  return {
    id: r.id,
    senderShort: r.sender_short as UserId | 'S',
    content: r.content,
    isSystem: r.is_system,
    channelId: r.channel_id,
    timestamp: new Date(r.created_at).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false }),
    createdAt: r.created_at,
    replyToId: r.reply_to_id ?? null,
    replyToContent: r.reply_to_content ?? null,
    replyToSender: r.reply_to_sender ?? null,
    isEdited: r.is_edited ?? false,
    originalContent: r.original_content ?? null,
  };
}

export function dbChannel(r: DbChannel): ChatChannel {
  return {
    id: r.id,
    name: r.name,
    createdBy: r.created_by,
    members: Array.isArray(r.members) && r.members.length > 0 ? r.members as UserId[] : null,
    passphraseCheck: r.passphrase_check,
    createdAt: r.created_at,
  };
}

export function dbDoc(r: DbDoc): StartupDoc {
  return {
    id: r.id,
    title: r.title,
    content: r.content,
    tags: Array.isArray(r.tags) ? r.tags : [],
    attachments: Array.isArray(r.attachments) ? r.attachments : [],
    createdBy: r.created_by,
    updatedAt: r.updated_at,
    isFavorite: r.is_favorite ?? false,
  };
}

export type { DbNotification };

interface RealtimeCallbacks {
  householdId: string | null;
  // Initial load / manual refresh (bulk)
  onEvents:        (evs: CalEvent[]) => void;
  onTodos:         (ts: Todo[]) => void;
  onAlarms:        (as: Alarm[]) => void;
  onActivity:      (a: ActivityItem[]) => void;
  onNotifications: (n: DbNotification[]) => void;
  onMessages:      (msgs: ChatMessage[]) => void;
  onDocs:          (docs: StartupDoc[]) => void;
  onChannels:      (chans: ChatChannel[]) => void;
  onFocusSessions: (sessions: any[]) => void;
  // Granular realtime (single row)
  onUpsertMessage:  (msg: ChatMessage) => void;
  onDeleteMessage:  (id: string) => void;
  onUpsertTodo:     (todo: Todo) => void;
  onDeleteTodo:     (id: string) => void;
  onUpsertEvent:    (event: CalEvent) => void;
  onDeleteEvent:    (id: string) => void;
  onUpsertDoc:      (doc: StartupDoc) => void;
  onDeleteDoc:      (id: string) => void;
  onUpsertChannel:  (channel: ChatChannel) => void;
  onDeleteChannel:  (id: string) => void;
}

export function useRealtime({
  householdId,
  onEvents, onTodos, onAlarms, onActivity, onNotifications, onMessages, onDocs, onChannels, onFocusSessions,
  onUpsertMessage, onDeleteMessage,
  onUpsertTodo, onDeleteTodo,
  onUpsertEvent, onDeleteEvent,
  onUpsertDoc, onDeleteDoc,
  onUpsertChannel, onDeleteChannel,
}: RealtimeCallbacks): { refresh: () => Promise<void> } {

  const fetchAll = useCallback(async () => {
    if (!householdId) return;

    const today = new Date();
    const dow = today.getDay();
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);

    const fmt = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    const from = fmt(monday);
    const future = new Date(today);
    future.setDate(today.getDate() + 13);
    const toDate = fmt(future);

    const [{ data: evs }, { data: todos }, { data: alarms }, { data: acts }, { data: notifs }, { data: msgs }, { data: docs }, { data: chans }, { data: focuses }] = await Promise.all([
      supabase.from('events').select('*').eq('household_id', householdId).gte('event_date', from).lte('event_date', toDate).order('start_time'),
      supabase.from('todos').select('*, profiles!todos_owner_id_fkey(short_id)').eq('household_id', householdId).order('created_at'),
      supabase.from('alarms').select('*, profiles!alarms_owner_id_fkey(short_id)').eq('household_id', householdId).order('alarm_time'),
      supabase.from('activity').select('*').eq('household_id', householdId).order('created_at', { ascending: false }).limit(30),
      supabase.from('notifications').select('*').eq('household_id', householdId).order('created_at', { ascending: false }).limit(50),
      supabase.from('messages').select('*').eq('household_id', householdId).order('created_at', { ascending: true }).limit(200),
      supabase.from('docs').select('*').eq('household_id', householdId).order('updated_at', { ascending: false }),
      supabase.from('channels').select('*').eq('household_id', householdId).order('created_at'),
      supabase.from('focus_sessions').select('*').eq('household_id', householdId).order('started_at', { ascending: false }),
    ]);

    if (evs)    onEvents(evs.map(dbEvent));
    if (todos)  onTodos(todos.map(r => dbTodo({ ...r, short_id: r.profiles?.short_id })));
    if (alarms) onAlarms(alarms.map(r => dbAlarm({ ...r, short_id: r.profiles?.short_id })));
    if (acts)   onActivity(acts.map(r => ({
      t:     new Date(r.created_at).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false }),
      who:   r.actor_short,
      verb:  r.verb,
      obj:   r.obj,
      badge: r.badge,
    })));
    if (notifs) onNotifications(notifs as DbNotification[]);
    if (msgs)   onMessages(msgs.map(dbMessage));
    if (docs)   onDocs(docs.map(dbDoc));
    if (chans)  onChannels(chans.map(dbChannel));
    if (focuses) onFocusSessions(focuses);
  }, [householdId]);

  useEffect(() => {
    if (!householdId) return;
    fetchAll();

    const channel = supabase
      .channel(`household:${householdId}`)

      // ── Messages: granular upsert/delete
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `household_id=eq.${householdId}` }, ({ new: r }) => {
        onUpsertMessage(dbMessage(r as DbMessage));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `household_id=eq.${householdId}` }, ({ new: r }) => {
        onUpsertMessage(dbMessage(r as DbMessage));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: `household_id=eq.${householdId}` }, ({ old: r }) => {
        onDeleteMessage((r as any).id);
      })

      // ── Todos: granular upsert/delete
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'todos', filter: `household_id=eq.${householdId}` }, ({ new: r }) => {
        onUpsertTodo(dbTodo(r as DbTodo));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'todos', filter: `household_id=eq.${householdId}` }, ({ new: r }) => {
        onUpsertTodo(dbTodo(r as DbTodo));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'todos', filter: `household_id=eq.${householdId}` }, ({ old: r }) => {
        onDeleteTodo((r as any).id);
      })

      // ── Events: granular upsert/delete
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events', filter: `household_id=eq.${householdId}` }, ({ new: r }) => {
        onUpsertEvent(dbEvent(r as DbEvent));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'events', filter: `household_id=eq.${householdId}` }, ({ new: r }) => {
        onUpsertEvent(dbEvent(r as DbEvent));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'events', filter: `household_id=eq.${householdId}` }, ({ old: r }) => {
        onDeleteEvent((r as any).id);
      })

      // ── Docs: granular upsert/delete
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'docs', filter: `household_id=eq.${householdId}` }, ({ new: r }) => {
        onUpsertDoc(dbDoc(r as DbDoc));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'docs', filter: `household_id=eq.${householdId}` }, ({ new: r }) => {
        onUpsertDoc(dbDoc(r as DbDoc));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'docs', filter: `household_id=eq.${householdId}` }, ({ old: r }) => {
        onDeleteDoc((r as any).id);
      })

      // ── Channels: granular upsert/delete
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'channels', filter: `household_id=eq.${householdId}` }, ({ new: r }) => {
        onUpsertChannel(dbChannel(r as DbChannel));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'channels', filter: `household_id=eq.${householdId}` }, ({ new: r }) => {
        onUpsertChannel(dbChannel(r as DbChannel));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'channels', filter: `household_id=eq.${householdId}` }, ({ old: r }) => {
        onDeleteChannel((r as any).id);
      })

      // ── Activity, notifications, alarms, focus_sessions: still refetch (low frequency, small payloads)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity',       filter: `household_id=eq.${householdId}` }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications',  filter: `household_id=eq.${householdId}` }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alarms',         filter: `household_id=eq.${householdId}` }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'focus_sessions', filter: `household_id=eq.${householdId}` }, fetchAll)

      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [householdId, fetchAll]);

  return { refresh: fetchAll };
}
