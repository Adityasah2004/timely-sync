# Timely — Co-Founder Sync & Startup War Room

A real-time, zero-knowledge collaboration suite built for startup co-founders. Secure coordination, roadmap planning, specification tracking, and AI-driven automation — all in one place.

Built with **Expo SDK 56 (React Native)** + **Supabase**. Fully open source — fork it, brand it, ship it as your own.

---

## Features

### End-to-End Encrypted Chat
- AES-256-CBC encryption with SHA-256 key derivation via `crypto-js`
- Keys cached on-device using iOS Keychain / Android Keystore (`expo-secure-store`) — passphrases never touch the server
- Per-channel E2EE passphrases with a lock/unlock HUD
- Encrypted dispatcher (system) messages — hidden when undecryptable, same as regular bubbles
- Backward-compatible with legacy plain-text message history
- WhatsApp-style bottom-up message stream with date separators, sender avatars, and bubble alignment

### Channels & Lobby
- Public and private channels with optional member restrictions
- SVG lock icon in the lobby (no emoji) indicating E2EE status per channel
- Channel creation with passphrase and member access control

### Smart Dispatcher (Slash Commands)
Type slash commands directly in chat to automate shared work:

| Command | What it does |
|---|---|
| `/todo [task]` | Adds a shared backlog task with optional `priority:` and `assigned_to:` params |
| `/event [title]` | Schedules a roadmap event with `time:`, `date:`, and `who:` params |
| `/status [name]` | Generates a real-time co-founder digest (availability, backlog, agenda) |
| `/help` | Lists all commands and parameters |

- Autocomplete overlays for commands, `@mentions`, `#doc` links, and parameter values
- `/event date:` autocomplete offers Today, Tomorrow, day-after, and Next Week options
- Long-press any message bubble to convert it into a shared to-do

### Plan (Calendar)
- Weekly timeline grid (06:00–22:00) with lane-based overlap detection
- **Sunday night planning** — a THIS WEEK / NEXT WEEK toggle appears only on Sundays so you can plan the upcoming week; hidden every other day
- Today's day chip is highlighted with a bold border
- 14-day rolling event fetch window so planned-ahead events load immediately
- Private events show as "busy" to other members

### Add Event — Date Picker
- Horizontal date chip strip (Today + next 14 days) replaces the old hardcoded "today"
- Sheet header and save button update live to reflect the selected date
- Reminders: at time, 5 min, 15 min, 30 min, 1 hour, 1 day before

### Startup Docs & Spec Wiki
- Tag-filtered document board (`#spec`, `#pitch`, `#metrics`, `#feedback`, `#ideas`, `#retro` + custom tags)
- Custom tags appear in the filter bar immediately — no save required
- Full markdown editor with WRITE / PREVIEW toggle
- **SMART FORMAT** — offline markdown auto-formatter (detects headings, bullets, key:value pairs)
- **ENHANCE WITH AI** — Groq Llama restructures raw notes into a professional spec document (`EXPO_PUBLIC_GROQ_KEY` required)
- Multi-format file attachments (PDF, DOCX, XLS, etc.) uploaded to Supabase Storage
- Native voice memo recording and playback (`expo-audio` SDK 56)
- File upload uses `fetch → arrayBuffer → Uint8Array` — correct React Native pattern, no blob issues

### Todos
- Personal and shared to-dos with priority levels (P1/P2/P3)
- Subtasks with progress bar
- Multi-member assignment
- Due labels: TODAY, TOMORROW, THIS WEEK, LATER

### Security & Isolation
- **Full household RLS** — all 11 Supabase tables enforce `household_id = get_my_household_id()` at the DB level for both `anon` and `authenticated` roles
- Two households using the same chat passphrase cannot access each other's data — DB-level scoping applies before encryption
- Storage bucket policies allow `anon` role uploads (app uses anon key without `auth.signIn`)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native + Expo SDK 56 |
| Database | Supabase (PostgreSQL + Realtime + Storage) |
| Encryption | `crypto-js` AES-256-CBC + SHA-256 |
| Secure storage | `expo-secure-store` (Keychain/Keystore) |
| AI enhancement | Groq API (Llama 3.1) |
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
│       ├── Today/TodayScreen.tsx    # Dashboard, member status, activity feed
│       ├── Plan/PlanScreen.tsx      # Weekly calendar + Sunday next-week toggle
│       ├── Todos/TodosScreen.tsx    # To-do lists with subtasks
│       ├── Chat/ChatScreen.tsx      # E2EE chat, slash commands, dispatcher
│       ├── Docs/DocsScreen.tsx      # Spec wiki, AI enhance, voice memos
│       ├── You/YouScreen.tsx        # Profile, roles, preferences
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

This creates all tables, enables RLS, sets up the `doc-attachments` storage bucket, and applies all policies.

### 4. Start the dev server

```bash
npx expo start
```

- Press `a` — Android emulator
- Press `i` — iOS simulator
- Scan QR code — Expo Go on your physical device

---

## Publishing as Your Own App

### Step 1 — Fork and rebrand

1. Fork this repo on GitHub
2. In `app.json`, update:
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
3. Replace `assets/icon.png`, `assets/android-icon-foreground.png`, `assets/android-icon-background.png` with your own icons

### Step 2 — Create an Expo account and project

```bash
npx eas login
npx eas init        # Creates a new project and writes projectId into app.json
```

Update `app.json` with the new `projectId` inside `extra.eas`.

### Step 3 — Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → New project
2. Copy your **Project URL** and **anon public key** from Project Settings → API
3. Run migrations: `npx supabase db push --yes`

### Step 4 — Add EAS environment variables

```bash
npx eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value "https://..." --environment production --type string --visibility sensitive
npx eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "eyJ..." --environment production --type string --visibility sensitive
npx eas env:create --name EXPO_PUBLIC_GROQ_KEY --value "gsk_..." --environment production --type string --visibility sensitive

# Repeat for preview environment
npx eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value "https://..." --environment preview --type string --visibility sensitive
npx eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "eyJ..." --environment preview --type string --visibility sensitive
npx eas env:create --name EXPO_PUBLIC_GROQ_KEY --value "gsk_..." --environment preview --type string --visibility sensitive
```

### Step 5 — Build the APK (Android)

```bash
# Preview build (internal testing, fastest)
npx eas build --platform android --profile preview

# Production build (Play Store / direct install)
npx eas build --platform android --profile production
```

EAS will build in the cloud and give you a download link for the APK.

### Step 6 — Ship OTA updates (no rebuild required)

After code changes, push an over-the-air update instantly without a new build:

```bash
npx eas update --channel preview --message "describe your changes"
# or for production
npx eas update --channel production --message "describe your changes"
```

Users on Expo Go or your published APK receive the update automatically on next launch.

### Step 7 — (Optional) Set up iOS build

```bash
npx eas build --platform ios --profile production
```

Requires an Apple Developer account ($99/year) and valid provisioning profiles. EAS handles code signing automatically.

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Yes | Your Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `EXPO_PUBLIC_GROQ_KEY` | No | Groq API key for AI document enhancement. Free tier at [console.groq.com](https://console.groq.com) |

---

## Database

All migrations are in `supabase/migrations/` and are applied in order by `supabase db push`. They are fully idempotent — safe to re-run.

| Migration | What it does |
|---|---|
| `20260523000001` | Core schema: households, profiles, events, todos, alarms, activity |
| `20260523000002` | `get_my_household_id()` security-definer function (prevents RLS recursion) |
| `20260523000003–006` | RLS fixes, household policies, notifications, preferences |
| `20260524000001–004` | Multi-member support, shared todos, event reminders |
| `20260528000001` | Messages table + RLS |
| `20260528000002` | Docs table + RLS + realtime |
| `20260528000003` | `doc-attachments` storage bucket + policies |
| `20260531000001` | Subtasks + multi-assignment on todos |
| `20260531000002` | Channels table + RLS + realtime |
| `20260531000003–004` | Storage policy fix (anon role), full RLS re-enable with anon+authenticated |

---

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for the full version history.

**Latest — v1.1.0 (2026-05-31)**
- Full household RLS enforced at DB level across all tables
- Docs file/voice upload fixed (React Native blob → Uint8Array)
- Add Event sheet with 14-day date picker
- Sunday next-week planner toggle
- AI doc enhancement via Groq (EXPO_PUBLIC_GROQ_KEY)
- Dispatcher messages hidden when undecryptable
- Custom doc tags appear instantly in filter bar
- Trash icon, touch highlight fixes

---

## License

MIT — free to use, fork, and ship as your own product.
