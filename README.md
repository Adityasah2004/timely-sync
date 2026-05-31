# Timely — Co-Founder Sync & Startup War Room 🚀

Timely is a premium, real-time, zero-knowledge collaboration suite built for startup co-founders. Transitioned from a generic household calendar into a high-performance **Startup War Room**, the app facilitates bulletproof secure coordination, roadmap alignment, specification tracking, and AI-driven automation.

Built with **Expo SDK 56 (React Native)** + **Supabase**, Timely features seamless on-device **End-to-End Encryption (E2EE)**, interactive **Voice Memos**, multi-format **Document Attachments**, and an automated **AI Dispatcher**.

---

## ✨ Key Features & Architecture

### 🔒 1. Zero-Knowledge End-to-End Encryption (E2EE)
- **High-Performance Cryptography**: Powered by **AES-256-CBC** symmetric encryption and **SHA-256 key derivation** (`crypto-js`).
- **Hardware-Secured Key Vault**: Caches keys locally using Expo's **iOS Keychain** and **Android Keystore**-backed `expo-secure-store`—no secret passphrases ever touch the remote database.
- **Glassmorphic Security HUD**: A dark security overlay locks the Sync screen on clean boot until the correct co-founder passphrase is provided.
- **Full Backward Compatibility**: Employs E2EE message envelope detection so that legacy unencrypted message threads render perfectly alongside newer ciphertexts.
- **Lock & Key Rotation**: Features a top-right `LOCK` action button allowing co-founders to rotate the keys or instantly lock down their war room on demand.

### 💬 2. Advanced Messaging Stream (WhatsApp-Style)
- **Bottom-Up Stream Layout**: Chat thread aligns from bottom-to-top (`contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }}`) pushing previous messages upwards as the stream grows.
- **Dynamic Chronological Date Separators**: Group messages using a client-side timezone-aware algorithm into `TODAY`, `YESTERDAY`, and standard uppercase dates (e.g. `MAY 29, 2026`).
- **Bubble Alignments**: Outgoing chats (`isMe`) stack on the right inside sleek charcoal bubbles; incoming chats align left inside bordered bubbles, complete with co-founder avatars, names, and roles.
- **E2E Lock Badge Indicators**: Centered lock badges and message-specific visual E2E locks verify cryptographically secured messages inside every bubble.

### 📝 3. Collaborative Spec Wiki & Document Attachments
- **Roadmap Specs Board**: Organize ideas, metrics, pitch materials, and feedback logs using tagged filters (`#spec`, `#pitch`, `#metrics`, `#feedback`).
- **Multi-Format Document Picker**: Attach and sync `.pdf`, `.xls`, and `.docx` files using the `expo-document-picker` API.
- **Supabase Storage Integration**: Safe uploads directly to the secure `doc-attachments` storage bucket with Row-Level Security (RLS) policies.

### 🎙️ 4. Native Voice Memos (`expo-audio`)
- **SDK 56 Next-Gen Audio API**: Native Recording and Playback utilizing Expo's new modular **`expo-audio`** SDK.
- **Real-Time Recording HUD**: Microphone permission gates and ticks a live duration timer (`RECORDING MEMO · 00:12`) as you record.
- **Interactive Audio Player Card**: Monospace visual audio card displaying dynamic waveforms, timeline seek status, and precise play/pause state synchronization.

### 🤖 5. Smart Dispatcher AI Commands Engine
- **Command Parser**: Automatically intercepts user chats looking for quick slash directives:
  - `/todo [task]` (e.g., `/todo Finalize pitch deck`): Instantly schedules shared sprint tasks.
  - `/event [session] at [time]` (e.g., `/event VC call at 16:30`): Schedules roadmap slots.
  - `/status` (or `/status` command): Automatically compiles real-time AI status digests of today's roadmap events and outstanding backlog items.
  - `/help`: Detailed command engine shortcuts.

### 📣 6. Team Mentions & Push Notifications
- **Autocomplete Tag HUD**: Typing `@` opens a floating autocomplete dialog to select co-founders.
- **Live Notifications Dispatch**: Tagging a co-founder automatically parses the message and dispatches an urgent alert to the `notifications` database table.

---

## 📂 Project Structure Map

```
timely-app/
├── App.tsx                          # Main app entry, auth-gates, tab navigation & hardware back handlers
├── app.json                         # Expo configuration, Supabase keys, & native permissions
├── eas.json                         # EAS build profiles (internal APK + App Store releases)
├── src/
│   ├── lib/
│   │   ├── types.ts                 # ChatMessage, Todo, CalEvent, DocAttachment data interfaces
│   │   ├── store.tsx                # Reducer store, realtime Supabase subscriptions
│   │   ├── useRealtime.ts           # Realtime Supabase channels mappings
│   │   ├── crypto.ts                # AES-256 E2EE, SHA-256 key derivation routines
│   │   ├── tokens.ts                # Harmony gray color tokens, typography & spacing
│   │   └── notifications.ts         # Local system notifications scheduler
│   ├── components/
│   │   ├── Primitives.tsx           # ScreenHeader, UserChip, UserStripe, standard Card, IconBtn
│   │   ├── Sheets.tsx               # AddEvent, AddTodo sheets (filters by sharedWith)
│   │   └── Icon.tsx                 # Unified vector SVG icon sets
│   ├── navigation/
│   │   └── TabBar.tsx               # Bottom floating navigation (auto-hides when keyboard is visible)
│   └── screens/
│       ├── Today/TodayScreen.tsx    # Home dashboard, co-founder status cards, activity feeds
│       ├── Plan/PlanScreen.tsx      # Sprint calendar week timelines
│       ├── Todos/TodosScreen.tsx    # To-do lists (personal, shared with filters)
│       ├── Chat/ChatScreen.tsx      # Secure E2EE Chat room, bottom-up flow, slash autocomplete, mentions
│       ├── Docs/DocsScreen.tsx      # Product Specs, voice memo recorder & attachments manager
│       ├── You/YouScreen.tsx        # Profile configuration, roles, bedtime settings
│       └── Notifications/           # Notification list alerts panel
└── supabase/
    └── migrations/                  # Realtime databases schemas, attachments buckets & RLS rules
```

---

## 🛠️ CLI Operations

### 1. Run Development Server
Start the Expo bundling server:
```bash
npm run dev
# or
npx expo start
```
- Press `a` for Android Emulator.
- Press `i` for iOS Simulator.

### 2. Run Type Verification
Verify that the complete codebase compiles cleanly with no static TypeScript errors:
```bash
npx tsc --noEmit
```

### 3. Trigger Production EAS Build
Build a new APK binary containing all the native bindings (`expo-secure-store` keychain, `expo-document-picker` permissions):
```bash
npx eas-cli build --platform android --profile production
```

---

## ⚙️ Technology Stack
- **Framework**: React Native with Expo SDK 56
- **Database**: Supabase PostgreSQL (auth-tokens, tables, storage-buckets, and real-time triggers)
- **Styling**: Harmony Grayscale Vanilla CSS Stylesheets
- **Design Aesthetic**: Premium minimalist Courier monospace headers, dynamic glassmorphic HUDs, 1px border tokens, and responsive side-by-side flex layouts.
