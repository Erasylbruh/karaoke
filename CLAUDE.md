@AGENTS.md

# KaraokeCraft: what to know before working here

## Data
- Firebase project `karaoke-craft`. Auth and data live in Firestore; audio and fonts live in Supabase Storage (`lib/blob-store.ts`).
- `lib/store.ts` mirrors every collection in memory through `onSnapshot`; `lib/storage.ts` is the synchronous API on top of it. `Col.patch` rewrites the whole document; use `Col.increment` for counters.
- Only guest plays and guests' seen tutorials stay in `localStorage`; signed-in tutorial marks are in `users/{id}.seenTutorials`.
- Firestore can be read without auth over REST: `https://firestore.googleapis.com/v1/projects/karaoke-craft/databases/(default)/documents/<collection>`. The rules let guests write `viewsCount`, `likesCount`, `recommendationScore`, `isFeatured` on karaokes and the legacy collections (`events`, `interactions`, ...) until 2026-12-31.
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
