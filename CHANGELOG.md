# Changelog

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
