import type { User, UserId, CalEvent, Alarm, Todo, ActivityItem, Notification, WorldClock } from '../lib/types';
import { USER_SLOTS } from '../lib/types';

export const USERS: Record<UserId, User> = {
  '1': { id: '1', name: 'Member 1', full: 'Member 1', role: '', tagline: '' },
  '2': { id: '2', name: 'Member 2', full: 'Member 2', role: '', tagline: '' },
  '3': { id: '3', name: 'Member 3', full: 'Member 3', role: '', tagline: '' },
  '4': { id: '4', name: 'Member 4', full: 'Member 4', role: '', tagline: '' },
  '5': { id: '5', name: 'Member 5', full: 'Member 5', role: '', tagline: '' },
  '6': { id: '6', name: 'Member 6', full: 'Member 6', role: '', tagline: '' },
  '7': { id: '7', name: 'Member 7', full: 'Member 7', role: '', tagline: '' },
  '8': { id: '8', name: 'Member 8', full: 'Member 8', role: '', tagline: '' },
};

export const USER_LIST: UserId[] = USER_SLOTS;

// Static demo data below — never shown at runtime (Supabase data takes over on launch).
// Uses legacy M/A who-slots; cast to silence TS.

export const TODAY_EVENTS: CalEvent[] = [] as any[];

export const WEEK_EVENTS: Record<string, CalEvent[]> = {} as any;

export const ALARMS_INIT: Alarm[] = [] as any[];

export const TODOS_INIT: Todo[] = [] as any[];

export const ACTIVITY: ActivityItem[] = [] as any[];

export const NOTIFICATIONS: Notification[] = [];

export const WORLD_CLOCKS: WorldClock[] = [];

export const FOCUS_STATS = {
  weekMinutes: 0,
  goal: 20 * 60,
  streak: 0,
  longest: 0,
  byUser: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0, '8': 0 } as Record<UserId, number>,
};
