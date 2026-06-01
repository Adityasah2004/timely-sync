# timely-sync

A real-time productivity and coordination app for people who share their lives — co-founders, flatmates, couples, or small households. Plan your week, stay on top of shared tasks, communicate securely, and keep everything in one place.

Built with **Expo SDK 56 (React Native)** + **Supabase**. Fully open source — fork it, brand it, ship it as your own.

---

## Who is this for?

| Use case | How timely-sync helps |
|---|---|
| **Co-founders** | Align on roadmap, track sprint tasks, share specs, run a secure war room chat |
| **Flatmates** | Shared todo lists, household events, split schedules, group chat |
| **Couples** | Shared calendar, private notes, synced reminders, see each other's availability |
| **Small teams** | Lightweight async coordination without full project management overhead |

Up to 4 members per household. Everyone sees the same shared state in real time.

---

## Features

### Shared Calendar & Planning
- Weekly timeline grid (06:00–22:00) with event lane overlap detection
- 14-day scrollable date picker — add events for any day, not just today
- Private events shown as "busy" to other members — no details leaked
- **Sunday night planning** — THIS WEEK / NEXT WEEK toggle appears only on Sundays so you can plan the week ahead; hidden every other day
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
- System messages hidden when channel is locked — no information leakage
- WhatsApp-style message stream: date separators, sender avatars, bubble alignment
- Lock / unlock any channel on demand

### Smart Slash Commands (in Chat)
Type slash commands to automate shared work without leaving the conversation:

| Command | What it does |
|---|---|
| `/todo [task]` | Creates a shared task — supports `priority:` and `assigned_to:` |
| `/event [title]` | Schedules an event — supports `time:`, `date:`, and `who:` |
| `/status [name]` | Live digest: availability, active tasks, upcoming agenda for any member |
| `/help` | Lists all commands and parameters |

- Autocomplete overlays for commands, `@mentions`, `#document` links, and parameter values
- `date:` autocomplete offers Today, Tomorrow, day-after, and Next Week

### Docs & Notes Wiki
- Tagged document board — filter by `#spec`, `#pitch`, `#metrics`, `#feedback`, `#ideas`, `#retro`, or any custom tag
- Custom tags appear in the filter bar immediately — no save required; reusable across all docs
- Full markdown editor with WRITE / PREVIEW toggle
- **SMART FORMAT** — one-tap offline markdown formatter
- **ENHANCE WITH AI** — Groq Llama restructures raw notes into clean, professional documents (free Groq API key)
- File attachments: PDF, DOCX, XLS, images — uploaded to Supabase Storage
- Voice memo recording and playback directly inside a document (`expo-audio` SDK 56)

### Real-Time Sync
- Every change — tasks, events, messages, docs — propagates to all household members instantly via Supabase Realtime
- 14-day rolling event fetch so planned-ahead items always load
- Activity feed on the home screen: live log of what everyone has been doing

### Security & Household Isolation
- Every table is row-level secured — one household cannot read another household's data
- Two households sharing the same chat passphrase cannot cross-contaminate — DB scoping enforces isolation before encryption applies
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
├── CHANGELOG.md                     # Version history
├── src/
│   ├── lib/
│   │   ├── types.ts                 # Shared TypeScript interfaces
│   │   ├── store.tsx                # Global reducer + Supabase auth bootstrap
│   │   ├── useRealtime.ts           # Supabase realtime subscriptions + 14-day fetch
│   │   ├── crypto.ts                # AES-256 E2EE encryption / decryption
│   │   ├── tokens.ts                # Color tokens, spacing, shadow scales
│   │   └── notifications.ts        # Local push notification scheduler
│   ├── components/
│   │   ├── Primitives.tsx           # ScreenHeader, Card, UserChip, IconBtn, etc.
│   │   ├── Sheets.tsx               # AddEvent (date picker), AddTodo, channel sheets
│   │   └── Icon.tsx                 # SVG icon registry
│   ├── navigation/
│   │   └── TabBar.tsx               # Floating bottom tab bar
│   └── screens/
│       ├── Today/TodayScreen.tsx    # Dashboard, member status cards, activity feed
│       ├── Plan/PlanScreen.tsx      # Weekly calendar + Sunday next-week toggle
│       ├── Todos/TodosScreen.tsx    # To-do lists with subtasks and assignment
│       ├── Chat/ChatScreen.tsx      # E2EE chat, slash commands
│       ├── Docs/DocsScreen.tsx      # Notes wiki, AI enhance, voice memos, attachments
│       ├── You/YouScreen.tsx        # Profile, display name, role, preferences
│       └── Notifications/          # Notification feed
└── supabase/
    └── migrations/                  # DB schema, RLS policies, storage bucket setup
```

---

## Running Locally

### Prerequisites
- Node.js 18+
- EAS CLI: `npm install -g eas-cli`
- A [Supabase](https://supabase.com) project
- (Optional) A free [Groq](https://console.groq.com) API key for AI doc enhancement

### 1. Clone and install

```bash
git clone https://github.com/Adityasah2004/timely-sync.git
cd timely-sync
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
       "android": { "package": "com.yourcompany.yourapp" },
       "owner": "your-expo-username"
     }
   }
   ```
3. Replace icon files in `assets/` with your own (1024×1024 `icon.png` + adaptive icon assets)

### Step 2 — Create Expo project

```bash
npx eas login
npx eas init
```

### Step 3 — Create Supabase project and apply migrations

```bash
npx supabase link --project-ref your-project-ref
npx supabase db push --yes
```

### Step 4 — Add EAS environment variables

```bash
npx eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value "https://..." --environment production
npx eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "eyJ..." --environment production
npx eas env:create --name EXPO_PUBLIC_GROQ_KEY --value "gsk_..." --environment production
# Repeat for --environment preview
```

### Step 5 — Build

```bash
npx eas build --platform android --profile preview     # test APK
npx eas build --platform android --profile production  # production APK
```

### Step 6 — Ship OTA updates (no rebuild needed)

```bash
npx eas update --channel production --message "what changed"
```

Works for all JS/TS changes. Native code changes need a full rebuild.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Yes | Your Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `EXPO_PUBLIC_GROQ_KEY` | No | Free Groq key for AI doc enhancement — [console.groq.com](https://console.groq.com) |

---

## Database Migrations

All migrations live in `supabase/migrations/` and are applied in order by `supabase db push`. They are idempotent — safe to re-run against a live database.

| Migration | What it does |
|---|---|
| `20260523000001` | Core schema: households, profiles, events, todos, alarms, activity |
| `20260523000002` | `get_my_household_id()` security-definer function (prevents RLS recursion) |
| `20260523000003–006` | RLS fixes, household policies, notifications table, member preferences |
| `20260524000001–004` | Multi-member support, shared todos, event reminders |
| `20260528000001` | Messages table + household RLS + realtime |
| `20260528000002` | Docs table + household RLS + realtime |
| `20260528000003` | `doc-attachments` storage bucket + upload/delete policies |
| `20260531000001` | Subtasks (self-referencing `parent_id`) + multi-member `assigned_to` array |
| `20260531000002` | Channels table + RLS + realtime + `channel_id` FK on messages |
| `20260531000003–004` | Storage policy fix, full RLS re-enable on all tables |

---

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for the full version history.

---

## License

MIT — free to use, modify, fork, and ship as your own product.
