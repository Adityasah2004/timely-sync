# Timely — Shared Life, In Sync

A real-time productivity and sync app for people who share their lives — co-founders, flatmates, couples, or anyone running a household together. Plan your week, stay on top of shared tasks, communicate securely, and keep everything in one place.

Built with **Expo SDK 56 (React Native)** + **Supabase**. Fully open source — fork it, brand it, ship it as your own.

---

## Who is this for?

| Use case | How Timely helps |
|---|---|
| **Co-founders** | Align on roadmap, track sprint tasks, share specs, run a secure war room chat |
| **Flatmates** | Shared todo lists, household events, split schedules, group chat |
| **Couples** | Shared calendar, private notes, synced reminders, see each other's availability |
| **Small teams** | Lightweight async coordination without the overhead of full project management tools |

Up to 4 members per household. Everyone sees the same shared state in real time.

---

## Features

### Shared Calendar & Planning
- Weekly timeline grid (06:00–22:00) with event lane overlap detection
- Add events for any day — a 14-day date picker chip strip replaces the old "today only" limit
- Private events show as "busy" to other members — no details leaked
- **Sunday night planning** — a THIS WEEK / NEXT WEEK toggle appears only on Sundays so you can plan the week ahead; hidden every other day
- Today's day chip highlighted with a bold border so you always know where you are
- Event reminders: at time, 5 min, 15 min, 30 min, 1 hour, or 1 day before

### Shared & Personal To-Dos
- Personal and shared task lists with P1/P2/P3 priority levels
- Subtasks with a live progress bar
- Assign tasks to one or more members
- Due labels: TODAY, TOMORROW, THIS WEEK, LATER
- Long-press a chat message to instantly convert it into a shared task

### Secure Group Chat
- End-to-end encrypted messages — AES-256-CBC with SHA-256 key derivation
- Keys stored on-device only (iOS Keychain / Android Keystore) — passphrases never touch the server
- Multiple channels: public rooms and private E2EE war rooms with per-channel passphrases
- Encrypted dispatcher (system) messages hidden when undecryptable — same behaviour as regular bubbles
- WhatsApp-style message stream: date separators, sender avatars, bubble alignment
- Lock / unlock any channel on demand

### Smart Slash Commands (in Chat)
Type slash commands to automate shared work without leaving the conversation:

| Command | What it does |
|---|---|
| `/todo [task]` | Creates a shared task — supports `priority:` and `assigned_to:` params |
| `/event [title]` | Schedules an event — supports `time:`, `date:`, and `who:` params |
| `/status [name]` | Live digest: availability, active tasks, upcoming agenda for any member |
| `/help` | Lists all commands and parameters |

- Autocomplete overlays for commands, `@mentions`, `#document` links, and parameter values
- `date:` autocomplete offers Today, Tomorrow, day-after, and Next Week

### Docs & Notes Wiki
- Tagged document board — filter by `#spec`, `#pitch`, `#metrics`, `#feedback`, `#ideas`, `#retro`, or any custom tag
- Custom tags appear in the filter bar immediately — no save required; reusable across all docs
- Full markdown editor with WRITE / PREVIEW toggle
- **SMART FORMAT** — one-tap offline markdown formatter (detects headings, bullets, key:value pairs)
- **ENHANCE WITH AI** — Groq Llama restructures raw notes into a clean, professional document (free Groq API key required)
- File attachments: PDF, DOCX, XLS, images — uploaded to Supabase Storage
- Voice memo recording and playback directly inside a document (`expo-audio` SDK 56)

### Real-Time Sync
- Every change — tasks, events, messages, docs — propagates to all household members instantly via Supabase Realtime
- 14-day rolling event fetch so planned-ahead items always load
- Activity feed on the home screen shows a live log of what everyone has been doing

### Security & Household Isolation
- Every table in the database is row-level secured — one household cannot read another household's data even if they share the same Supabase project
- Two households using the same chat passphrase cannot cross-contaminate — DB scoping enforces isolation before encryption even applies
- Storage bucket policies correctly scoped to the app's anon role

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native + Expo SDK 56 |
| Database | Supabase (PostgreSQL + Realtime + Storage) |
| Encryption | `crypto-js` AES-256-CBC + SHA-256 |
| Secure storage | `expo-secure-store` (Keychain / Keystore) |
| AI enhancement | Groq API (Llama 3.1) — optional |
| Audio | `expo-audio` SDK 56 |
| File picker | `expo-document-picker` |
| Notifications | `expo-notifications` |
| OTA updates | EAS Update |

---

## Project Structure

```
timely-app/
├── App.tsx                          # Entry point, auth gate, tab navigation
├── app.json                         # Expo config, version, native permissions
├── eas.json                         # EAS build profiles (preview + production APK)
├── CHANGELOG.md                     # Full version history
├── src/
│   ├── lib/
│   │   ├── types.ts                 # Shared TypeScript interfaces
│   │   ├── store.tsx                # Global reducer + Supabase auth bootstrap
│   │   ├── useRealtime.ts           # Supabase realtime subscriptions + 14-day fetch
│   │   ├── crypto.ts                # AES-256 E2EE encryption / decryption
│   │   ├── tokens.ts                # Color tokens, spacing, shadow scales
│   │   └── notifications.ts         # Local push notification scheduler
│   ├── components/
│   │   ├── Primitives.tsx           # ScreenHeader, Card, UserChip, IconBtn, etc.
│   │   ├── Sheets.tsx               # AddEvent (with date picker), AddTodo, channel sheets
│   │   └── Icon.tsx                 # SVG icon registry (home, lock, trash, cal, …)
│   ├── navigation/
│   │   └── TabBar.tsx               # Floating bottom tab bar
│   └── screens/
│       ├── Today/TodayScreen.tsx    # Dashboard, member status cards, activity feed
│       ├── Plan/PlanScreen.tsx      # Weekly calendar + Sunday next-week toggle
│       ├── Todos/TodosScreen.tsx    # To-do lists with subtasks and assignment
│       ├── Chat/ChatScreen.tsx      # E2EE chat, slash commands, dispatcher
│       ├── Docs/DocsScreen.tsx      # Notes wiki, AI enhance, voice memos, attachments
│       ├── You/YouScreen.tsx        # Profile, display name, role, preferences
│       └── Notifications/           # Notification feed
└── supabase/
    └── migrations/                  # All DB schema, RLS policies, storage bucket setup
```

---

## Running Locally

### Prerequisites
- Node.js 18+
- Expo CLI: `npm install -g expo-cli`
- EAS CLI: `npm install -g eas-cli`
- A [Supabase](https://supabase.com) project
- (Optional) A free [Groq](https://console.groq.com) API key for AI doc enhancement

### 1. Clone and install

```bash
git clone https://github.com/Adityasah2004/Timely.git
cd timely-app
npm install
```

### 2. Set up environment variables

Create a `.env` file in the project root:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EXPO_PUBLIC_GROQ_KEY=your-groq-key        # Optional — enables AI doc enhancement
```

### 3. Apply database migrations

```bash
npx supabase login
npx supabase link --project-ref your-project-ref
npx supabase db push --yes
```

This creates all tables, enables RLS on every table, sets up the `doc-attachments` storage bucket, and applies all policies in one command.

### 4. Start the dev server

```bash
npx expo start
```

- Press `a` — Android emulator
- Press `i` — iOS simulator
- Scan the QR code — Expo Go on your physical device

---

## Publishing as Your Own App

### Step 1 — Fork and rebrand

1. Fork this repo on GitHub
2. In `app.json` update the identity fields:
   ```json
   {
     "expo": {
       "name": "Your App Name",
       "slug": "your-app-slug",
       "android": {
         "package": "com.yourcompany.yourapp"
       },
       "owner": "your-expo-username"
     }
   }
   ```
3. Replace the icon files in `assets/` with your own:
   - `icon.png` — 1024×1024
   - `android-icon-foreground.png` — adaptive icon foreground
   - `android-icon-background.png` — adaptive icon background

### Step 2 — Create an Expo account and project

```bash
npx eas login
npx eas init        # Generates a new projectId and writes it into app.json
```

### Step 3 — Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → New project
2. Copy your **Project URL** and **anon public key** from Project Settings → API
3. Link and push migrations:
   ```bash
   npx supabase link --project-ref your-project-ref
   npx supabase db push --yes
   ```

### Step 4 — Add EAS environment variables

```bash
# Production
npx eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value "https://..." --environment production --type string --visibility sensitive
npx eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "eyJ..." --environment production --type string --visibility sensitive
npx eas env:create --name EXPO_PUBLIC_GROQ_KEY --value "gsk_..." --environment production --type string --visibility sensitive

# Preview (for test builds)
npx eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value "https://..." --environment preview --type string --visibility sensitive
npx eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "eyJ..." --environment preview --type string --visibility sensitive
npx eas env:create --name EXPO_PUBLIC_GROQ_KEY --value "gsk_..." --environment preview --type string --visibility sensitive
```

### Step 5 — Build the Android APK

```bash
# Preview build — fast, internal testing, direct APK download
npx eas build --platform android --profile preview

# Production build — for Play Store or direct distribution
npx eas build --platform android --profile production
```

EAS builds in the cloud and emails you a download link when done.

### Step 6 — Ship OTA updates (no rebuild needed)

After any code change, push an over-the-air update that users receive on next launch:

```bash
npx eas update --channel preview --message "what changed"
# or
npx eas update --channel production --message "what changed"
```

No new APK build required. Works for all JS/TS changes — only native code changes need a full rebuild.

### Step 7 — (Optional) iOS build

```bash
npx eas build --platform ios --profile production
```

Requires an Apple Developer account ($99/year). EAS handles provisioning profiles and code signing automatically.

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Yes | Your Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `EXPO_PUBLIC_GROQ_KEY` | No | Groq API key for AI document enhancement. Free at [console.groq.com](https://console.groq.com) — no credit card needed |

---

## Database Migrations

All migrations live in `supabase/migrations/` and are applied in order by `supabase db push`. They are fully idempotent — safe to re-run against a live database.

| Migration | What it does |
|---|---|
| `20260523000001` | Core schema: households, profiles, events, todos, alarms, activity |
| `20260523000002` | `get_my_household_id()` security-definer function (prevents RLS recursion on profiles) |
| `20260523000003–006` | RLS fixes, household policies, notifications table, member preferences |
| `20260524000001–004` | Multi-member support (up to 4), shared todos with `shared_with`, event reminders |
| `20260528000001` | Messages table + household RLS + realtime |
| `20260528000002` | Docs table + household RLS + realtime |
| `20260528000003` | `doc-attachments` storage bucket + public read + anon upload/delete policies |
| `20260531000001` | Subtasks (self-referencing `parent_id`) + multi-member `assigned_to` array |
| `20260531000002` | Channels table + RLS + realtime + `channel_id` FK on messages |
| `20260531000003–004` | Storage policy fix (anon role), full RLS re-enable with `anon, authenticated` on all tables |

---

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for the full version history.

**Latest — v1.1.0 (2026-05-31)**
- Full household RLS enforced at DB level across all 11 tables
- Docs file and voice memo upload fixed (React Native blob → Uint8Array)
- Add Event sheet with 14-day scrollable date picker
- Sunday next-week planner toggle (hidden all other days)
- AI document enhancement via Groq API
- Dispatcher messages correctly hidden when undecryptable
- Custom doc tags appear instantly in filter bar without saving
- Trash icon on delete, doc card touch highlight removed
- All 17 Supabase migrations synced and made idempotent

---

## License

MIT — free to use, modify, fork, and ship as your own product.
