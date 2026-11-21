@AGENTS.md

# KaraokeCraft: what to know before working here

## Data
- Firebase project `karaoke-craft`. Auth and data live in Firestore; audio, covers and fonts live in Supabase Storage (`lib/blob-store.ts`).
- Uploads: the browser gets a signed upload URL from `/api/storage/upload` (checks the Firebase ID token, a confirmed email and bans; picks the path `{folder}/{uid}/{name}`) and PUTs the file straight to Supabase, so Vercel's ~4.5 MB body limit doesn't apply. `/api/storage/delete` removes own files (admins: any). Logic in `lib/server/storage.ts`, tested by `npm run test:storage` (mocked fetch). Both need `SUPABASE_SERVICE_ROLE_KEY`; without it (HTTP 501) the client falls back to direct anonymous uploads, which need `supabase/storage.dev.sql` (dev only). Deleting a track (studio, admin purge, account deletion) also deletes its files (`lib/track-files.ts`).
- Legal: operator, contact and document version are in `lib/legal.ts` (`LEGAL_VERSION`; bump it when /terms or /privacy change in substance, so `ConsentBanner` asks signed-in people to accept again). Registration requires two ticks; acceptance is stored in `userPrivate/{id}.termsVersion/consentAt` (`lib/account.ts recordConsent`).
- Tags: `usernames/{tag}` = `{uid}` must belong to the profile owner before the profile can carry the tag (rules). Reserve first (`reserveUsername`), then write the profile; tag changes go through `AuthContext.changeUsername`, not `updateProfile`.
- Account deletion: `lib/account.ts deleteAccountCompletely` (Settings → Аккаунт). It starts with a delete only the current rules allow, so outdated rules stop it before anything is gone; it deletes the profile before `userPrivate`, and AuthContext skips its email sync while `accountDeletionInProgress()`.
- `lib/store.ts` mirrors the public collections (karaokes, users, comments, playlists, follows) for everyone and the personal ones (notifications, downloads, events, likes, userPrivate) only for the signed-in person via `setSyncScope` (called from AuthContext). `lib/storage.ts` is the synchronous API on top of it. `Col.patch` sends only the changed fields (`undefined` deletes a field); use `Col.increment` / `upsertIncrement` for counters; `interactions` are read one by one with `createOnce`, never listed.
- `users/{id}` is the public profile; email, `warnings`, `banReason`, `termsVersion` and `consentAt` live in `userPrivate/{id}` (owner and admins only). `saveUser` splits them (`PRIVATE_KEYS`); `getUserById` merges them back when available. Sign-in is by email only (by tag would need public emails).
- `firestore.rules` are owner-only for personal data; new tracks and reviews need `email_verified` in the token (client pre-check: `AuthContext.ensureVerified`, which also refreshes a stale token); review names/avatars and notification names/titles must match the real ones (the bell rebuilds others' notifications from their type: `lib/notification-text.ts`). Tests in `tests/firestore.rules.test.mjs` (run against the emulator, see the file header). `NEXT_PUBLIC_USE_EMULATORS=1` (plus `NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-karaoke` to stay off production) in `.env.development.local` points the app at local Firestore/Auth emulators.
- Genres: a project's `tags` are picked in the editor from `config/genres.list` (admin page /admin/genres; `DEFAULT_GENRES` in lib/storage.ts until saved), max 6. Only admins may write `config/genres`; `config/aligner` ({url, updatedAt}) is written only by the auto-timing service's own Firebase account, whose uid sits in `services/aligner` (set in the console, no client access); see aligner/README.md.
- Email confirmation and password reset use Firebase Auth letters (`sendEmailVerification` on sign-up, /forgot page, `VerifyEmailBanner`); the reset answer never reveals whether an address is registered. Email change (/studio/settings → Аккаунт) re-checks the password and uses `verifyBeforeUpdateEmail`; AuthContext then copies the new sign-in email into `userPrivate` (after refreshing the token, since the rules compare it), or signs out to /login?email-changed=1 if Firebase ended the old session.
- Covers are cropped to 768×768 JPEG (`lib/cover.ts`) and uploaded to Supabase under `covers/`; the bucket must allow `image/*` (see `supabase/storage.sql`), otherwise `saveCover` falls back to a data URL inside the track. Older tracks may still hold data-URL covers until an admin runs «Перенести обложки» on /admin/tracks.
- Only guest plays and guests' seen tutorials stay in `localStorage`; signed-in tutorial marks are in `users/{id}.seenTutorials`.
- Firestore can be read without auth over REST: `https://firestore.googleapis.com/v1/projects/karaoke-craft/databases/(default)/documents/<collection>`. Public data only: guests may step `viewsCount`, `recommendationScore`, `isFeatured` on karaokes and add to `events` / `interactions`; personal collections need the owner's sign-in.
- Changing `firestore.rules` does nothing until it is published (`firebase deploy --only firestore:rules`, or Firebase Console → Firestore → Rules). The Firebase CLI is not installed on this machine. Publish rules before pushing code that relies on them.

## Stats
- `viewsCount` is the ▶ number. It grows only in `registerListen` (45% of the track really heard, once per run). The author's own listens and page opens never count.
- Daily chart data is in `events` (`{authorId}_{type}_{day}`).

## Running
- Windows PowerShell blocks `npm.ps1`: use `npm.cmd run dev` or the `dev` entry in `.claude/launch.json`.
- `npm.cmd run lint` and `npx tsc --noEmit` are clean; keep them that way.
- Tests: `npm run test:storage` (storage routes, plain Node 23.6+); Firestore rules tests need the emulator (header of `tests/firestore.rules.test.mjs`).

## Git and deploy
- Vercel rebuilds the site on every push to `main`, so work on a branch.
- `gh` is not installed; PRs are opened in the browser.
- Docs: `docs/DEPLOY.md` (including the rollout order for rules vs code), `docs/FIREBASE.md`.
- Release blockers and the latest audit are in `docs/RELEASE.md`, including the rollout order for the private-data change (push → publish rules → admin «Скрыть личные данные»).
- Agreed but not yet built work is listed in `docs/NEXT_TASKS.md`; video export designs and their prototypes are in `docs/video/`.
