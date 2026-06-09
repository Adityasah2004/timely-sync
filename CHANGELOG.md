# Changelog

## [1.2.0] — 2026-06-09

Release of **timely-sync** — ships a full WhatsApp-style chat upgrade with reply quotes, Group Info modal, granular real-time caching, message edit/delete, edited message indicators, and original message reveal.

### New Features

- **Reply Quotes inside Bubbles** — replying to a message shows a quoted snippet inside the bubble (WhatsApp/Telegram style), with a colored accent bar, sender name, and tap-to-scroll-and-highlight jump to the original message.
- **Group Info Modal** — tapping the channel name in the chat header opens a WhatsApp-style group info sheet showing channel name, member count, and all member chips.
- **Inline Edit / Delete on Double-Tap** — double-tapping your own message reveals edit (pencil) and delete (trash) icons inline next to the bubble; no floating menu.
- **Message Editing** — edit your own messages in-place; edited messages show a subtle italic "edited" label next to the timestamp.
- **Original Message Reveal** — long-pressing an edited message toggles a panel below the bubble showing the original content before any edits.
- **Triple-Tap → Create To-Do** — triple-tapping any message opens the Add To-Do modal pre-filled with the message text, so you can assign, prioritize, and save it directly.
- **Long-Press → Show Original** — long press on edited messages reveals original content; non-edited messages do nothing on long press.
- **Granular Real-Time Caching** — replaced the full-refetch-on-every-change pattern with per-event Supabase Realtime handlers (`INSERT`/`UPDATE`/`DELETE`) for messages, todos, events, docs, and channels. Deletes and edits reflect instantly with zero round trips.
- **Long-Press → Open Todo Modal** — long-pressing a message pre-fills the full Add To-Do sheet (with assignee, project, priority, notes) instead of a confirmation dialog.

### Bug Fixes

- Fixed partner chat bubble stretching full width for third+ household members — added `alignSelf` to bubble wrapper.
- Fixed sender name invisible for slot-1 users (white-on-white) — now uses `colors.fg4` for all partner names.
- Fixed reply quote text invisible on own (green) bubbles — corrected background and text colors.
- Fixed message highlight covering full row width on scroll-jump — highlight now wraps only the bubble, not the full-width row.
- Fixed bubble too narrow for short messages with a reply quote — added `minWidth` when quote is present.

### Technical

- New Supabase migration: `is_edited` (boolean) and `original_content` (text) columns on `messages` table.
- New Supabase migration: `reply_to_id`, `reply_to_content`, `reply_to_sender` columns on `messages` table.
- `useRealtime` rewritten with granular `RealtimeCallbacks` interface — separate `onUpsertMessage`, `onDeleteMessage`, `onUpsertTodo`, etc.
- Store updated with granular action types: `upsertMessage`, `deleteMessage`, `upsertTodo`, `deleteTodo`, `upsertEvent`, `deleteEvent`, `upsertDoc`, `deleteDoc`, `upsertChannel`, `deleteChannel`.
- E2EE: `original_content` is encrypted with the channel key before storing; only the first edit captures the original (subsequent edits preserve it).
- TypeScript clean — zero errors.

---

## [1.1.4] — 2026-06-02

Production release of **timely-sync** — ships the Kanban board, project folder filters, wiki spec pinning, chronological Today groupings, past calendar mapping, dynamic notifications, event rescheduling with custom date/time picker, and prepone/postpone day chips. Local notifications enabled for Expo Go with Android `POST_NOTIFICATIONS` permission.

### New Features

- **Advanced Kanban Board & View Toggles** — LIST / BOARD toggle for To-Dos; Board view with 4 columns (`To Do`, `In Progress`, `Blocked`, `Done`), horizontal scrolling, snap-to-interval lanes.
- **Project Folder Filter Strip** — dynamic horizontal filter strip grouping tasks by folder (`📁 Work`, `📁 Personal`, etc.).
- **Refined Kanban Cards** — folder indicators, priority-color badges, estimated time, subtask count, assignee chips, quick-move chevron actions.
- **Wiki Spec Pinning / Favorites** — favorited specs float to the top of the Docs wiki list.
- **Chronological Today Screen Groupings** — Up Next grouped as **Today**, **Tomorrow**, **Later**.
- **Past Calendar Events Mapping** — weekly grid now fetches from Monday of the current week, showing past events correctly.
- **Event Rescheduling** — custom date/time picker with presets to reschedule any event from the detail sheet.
- **Prepone / Postpone Chips** — quick `1d`, `2d`, `1w`, `1m` chips to shift event dates instantly.
- **Dynamic Task Notifications** — notification bodies show actor name, action verb, and task name in real time.

### Bug Fixes

- Fixed Android `POST_NOTIFICATIONS` permission missing from `app.json` (duplicate permissions removed).
- Enabled local notifications in Expo Go development builds.

### Technical

- EAS production build (Android APK, build `c25bf3b2`).
- TypeScript clean — zero errors.

---

## [1.1.0] — 2026-06-02

Upgrade of **timely-sync** — adding an Advanced Project Management system, dynamic spec favoriting/pinning, chronological Today view groupings, full weekly calendar past events mapping, and real-time dynamic task notifications.

### New Features

- **Advanced Kanban Board & View Toggles** — added a minimalist LIST / BOARD toggle for To-Dos; Board view implements 4 columns (`To Do`, `In Progress`, `Blocked`, `Done`) with horizontal scrolling, lanes peeking, and snap-to-intervals.
- **Project Folder Filter Strip** — engineered a dynamic horizontal projects filter strip that automatically gathers unique active folders (e.g. *📂 All Projects*, *📁 Work*, *📁 Personal*) and isolates board lanes/list buckets instantly.
- **Refined Kanban Cards** — cards styled with folder indicators, priority-color badges, estimated time (`⏱️ 4h`), subtask count (`☑️ 2/3`), stacked assignee chips, and quick-move actions (`chevLeft`/`chev`) to slide tasks between lanes.
- **Notes & Details on Creation** — added a **Notes & Details** text input inside the task creation sheet (`AddTodoSheet`) to write markdown descriptions, URLs, and details *during* task creation.
- **Post-Creation Due Date Rescheduling** — replaced the read-only due date tag in the detail sheet (`TodoDetailSheet`) with an interactive **Due Date segment picker** (`TODAY`, `TOMORROW`, `THIS WEEK`, `LATER`) to reschedule tasks on the fly.
- **Dynamic Task Notifications** — upgraded To-Do database notifications with dynamic titles and bodies showing the exact actor name, action verb, and task name (e.g. `[Name] completed a task: "[text]"` or `[Name] moved a task: "[text]" to In Progress`).
- **Chronological Today Screen Day-Groupings** — grouped the "Up Next" list chronologically by Day: **Today**, **Tomorrow**, and **Later** (Day after and beyond).
- **Startup Spec Wiki Pinning & Favorites** — added inline and modal Flag toggles to Documents; favorited/pinned specs automatically float and group together at the **absolute top** of the Specs wiki list.

### Bug Fixes & Optimizations

- **Severe Date-Overlap Bug Fix** — fixed a critical bug in Today Screen's "NOW" and "UPCOMING" mapping where tomorrow's events showed as active "NOW" today if the times matched, by strictly bounding them to today's local ISO date.
- **Past Calendar Events Mapping** — refactored the database range query bounds in the real-time syncing layer to fetch starting from the **Monday of the current week** instead of strictly starting from `today`, enabling yesterday's past events to correctly display on the Plan Screen's weekly grid.
- **Accurate "Done Today" Stats** — adjusted the home screen header subtext to count completed events specifically for today's date instead of the entire 14-day database window.

### Technical & Schema Upgrades

- **Supabase Remote Schema Migrations** — added columns: `status` (text), `project_name` (text), `notes` (text), and `estimated_hours` (integer) to `todos` table; and `is_favorite` (boolean) to `docs` table.
- **TypeScript Verification** — complete codebase checked and validated with `npx tsc --noEmit` returning 0 errors.

## [1.0.0] — 2026-06-01

Initial release of **timely-sync** — a complete rewrite of the previous project.

### Core Features

- **Shared Calendar & Planning** — weekly timeline grid (06:00–22:00), 14-day date picker, event lane overlap detection, private events shown as "busy" to other members
- **Sunday night planner** — THIS WEEK / NEXT WEEK toggle appears only on Sundays for weekly planning sessions
- **Shared & Personal To-Dos** — P1/P2/P3 priority levels, subtasks with live progress bar, multi-member assignment, due labels (TODAY / TOMORROW / THIS WEEK / LATER)
- **E2EE Group Chat** — AES-256-CBC encryption, keys stored on-device only (iOS Keychain / Android Keystore), per-channel passphrases, multiple public and private channels
- **Smart Slash Commands** — `/todo`, `/event`, `/status`, `/help` with autocomplete overlays for commands, @mentions, #doc links, and parameter values
- **Docs & Notes Wiki** — tagged document board, full markdown editor with WRITE/PREVIEW toggle, SMART FORMAT (offline formatter), ENHANCE WITH AI (Groq Llama), file attachments, voice memos
- **Real-Time Sync** — all changes propagate instantly to all household members via Supabase Realtime
- **Activity Feed** — live log of all household member actions on the home screen
- **Event Reminders** — at time, 5 min, 15 min, 30 min, 1 hour, or 1 day before
- **Household Isolation** — full row-level security on all Supabase tables; one household cannot read another's data

### Technical Foundation

- Expo SDK 56 (React Native) + Supabase (PostgreSQL + Realtime + Storage)
- EAS Build with preview and production Android profiles
- OTA updates via EAS Update (JS-only changes, no rebuild needed)
- `expo-audio` SDK 56 for voice memo recording and playback
- `expo-notifications` for local push notification scheduling
- `crypto-js` AES-256-CBC + `expo-secure-store` for E2EE key management
- Groq API (Llama 3.1) integration for AI document enhancement
- Full TypeScript — zero `any` in production paths
