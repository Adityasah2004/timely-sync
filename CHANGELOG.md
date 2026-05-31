# Changelog

## [1.1.0] — 2026-05-31

### Security
- **Full household isolation enforced at DB level** — re-enabled RLS on all 11 Supabase tables (`households`, `profiles`, `events`, `todos`, `alarms`, `activity`, `messages`, `docs`, `channels`, `notifications`, `focus_sessions`). Previously, 6 tables had RLS disabled after an early-dev workaround was never reverted. Any user with the anon key could read cross-household data via the REST API directly. All policies updated to cover both `anon` and `authenticated` roles (the app uses the anon key without `auth.signIn`).
- **E2EE chat passphrase cannot leak across households** — messages RLS was already correct; this confirms DB-level scoping prevents cross-household row access regardless of shared passphrases.
- **Storage bucket policies fixed** — `doc-attachments` INSERT/DELETE policies extended to `anon` role (were `authenticated`-only, blocking all uploads).

### Features

#### Docs
- **File & voice memo upload fixed** — replaced `fetch → blob` (unsupported in React Native) with `fetch → arrayBuffer → Uint8Array` for Supabase Storage uploads. Both file attachments and voice memos now upload correctly on Android.
- **Custom tags in filter bar** — custom tags added inside the editor appear immediately in the main filter bar and in other docs' tag pickers without needing to save first.
- **Delete icon** — replaced the `reset` (circular arrow) icon on the delete button with a proper `trash` icon. Added `trash` to the Icon component SVG registry.
- **Doc card touch highlight removed** — doc list cards no longer dim on press (`activeOpacity={1}`).
- **Local file:// guard** — attachments with stale local `file://` URIs (from before the upload fix) now show a clear "Unavailable" message instead of crashing with a `JSApplicationIllegalArgumentException`.

#### Chat
- **Dispatcher/system messages hidden when undecryptable** — system messages (DISPATCHER) now obey the same decryption filter as regular chat bubbles. Previously they always showed regardless of key state.
- **Secure lobby icon** — replaced the 🔒 emoji in the channel lobby eyebrow with the SVG `lock` icon, consistent with the rest of the UI.
- **`/event date:` autocomplete expanded** — date picker in the slash command autocomplete now offers Today, Tomorrow, day-after-tomorrow, and Next Week options (was Today + Tomorrow only).

#### Plan
- **Next-week planning on Sundays** — on Sunday, a `THIS WEEK / NEXT WEEK` toggle appears above the day strip so founders can plan the upcoming week on Sunday nights. The toggle is invisible on all other days.
- **Today pill highlighted** — today's day chip gets a bold border when viewing the current week.
- **14-day event fetch window** — `useRealtime` now fetches events over a rolling 14-day window (today + 13 days) instead of Mon–Sun of the current week, so planned-ahead events load immediately.

#### Add Event sheet
- **Date picker added** — a horizontal chip strip (Today → next 14 days) replaces the hardcoded `today` default. The sheet header and save button label update to reflect the selected date.
- **Chat `/event` default date** — chat-created events continue to default to today but the `date:` autocomplete now shows 4 options instead of 2.

### Infrastructure
- **`EXPO_PUBLIC_GROQ_KEY` added** — Groq API key for AI document enhancement added to `.env`, EAS secrets (production + preview environments), and `eas.json` build env config.
- **App version bumped** — `1.0.0` → `1.1.0`.
- **All Supabase migrations synced** — 10 previously unapplied migrations pushed to remote. Migration files made idempotent (`DROP POLICY IF EXISTS` + `DO $$ EXCEPTION WHEN duplicate_object`) to survive re-runs against a live DB.
