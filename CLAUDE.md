@AGENTS.md

# KaraokeCraft: what to know before working here

## Data
- Firebase project `karaoke-craft`. Auth and data live in Firestore; audio and fonts live in Supabase Storage (`lib/blob-store.ts`).
- `lib/store.ts` mirrors the public collections (karaokes, users, comments, playlists, follows) for everyone and the personal ones (notifications, downloads, events, likes, userPrivate) only for the signed-in person via `setSyncScope` (called from AuthContext). `lib/storage.ts` is the synchronous API on top of it. `Col.patch` sends only the changed fields (`undefined` deletes a field); use `Col.increment` / `upsertIncrement` for counters; `interactions` are read one by one with `createOnce`, never listed.
- `users/{id}` is the public profile; email, `warnings` and `banReason` live in `userPrivate/{id}` (owner and admins only). `saveUser` splits them; `getUserById` merges them back when available. Sign-in is by email only (by tag would need public emails).
- `firestore.rules` are owner-only for personal data; tests in `tests/firestore.rules.test.mjs` (run against the emulator, see the file header). `NEXT_PUBLIC_USE_EMULATORS=1` in `.env.development.local` points the app at local Firestore/Auth emulators.
- Covers are cropped to 768×768 JPEG (`lib/cover.ts`) and uploaded to Supabase under `covers/`; the bucket must allow `image/*` (see `supabase/storage.sql`), otherwise `saveCover` falls back to a data URL inside the track. Older tracks may still hold data-URL covers until an admin runs «Перенести обложки» on /admin/tracks.
- Only guest plays and guests' seen tutorials stay in `localStorage`; signed-in tutorial marks are in `users/{id}.seenTutorials`.
- Firestore can be read without auth over REST: `https://firestore.googleapis.com/v1/projects/karaoke-craft/databases/(default)/documents/<collection>`. Public data only: guests may step `viewsCount`, `recommendationScore`, `isFeatured` on karaokes and add to `events` / `interactions`; personal collections need the owner's sign-in.
- Changing `firestore.rules` does nothing until it is published (`firebase deploy --only firestore:rules`, or Firebase Console → Firestore → Rules). The Firebase CLI is not installed on this machine. Publish rules before pushing code that relies on them.

## Stats
- `viewsCount` is the ▶ number. It grows only in `registerListen` (45% of the track really heard, once per run). The author's own listens and page opens never count.
- Daily chart data is in `events` (`{authorId}_{type}_{day}`).

## Running
- Windows PowerShell blocks `npm.ps1`: use `npm.cmd run dev` or the `dev` entry in `.claude/launch.json`.
- `npm.cmd run lint` reports several old `react-hooks/set-state-in-effect` errors; check that a change adds no new ones.
- There is no test script.

## Git and deploy
- Branch `codex/localhost` tracks `origin/main`; Vercel rebuilds the site on every push to `main`.
- `gh` is not installed; PRs are opened in the browser.
- Docs: `docs/DEPLOY.md`, `docs/FIREBASE.md`.
- Release blockers and the latest audit are in `docs/RELEASE.md`, including the rollout order for the private-data change (push → publish rules → admin «Скрыть личные данные»).
- Agreed but not yet built work is listed in `docs/NEXT_TASKS.md`; video export designs and their prototypes are in `docs/video/`.
