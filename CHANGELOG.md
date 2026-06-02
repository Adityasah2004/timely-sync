# Changelog

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
