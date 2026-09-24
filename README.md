# Song Wars

A 2-player real-time music game. Each player spins a genre wheel then an artist wheel and locks into that artist for the game; each round shows a prompt, both players search their locked artist's catalog for a fitting song, and both songs play before a vote decides the round.

Live at **https://song-wars-lime.vercel.app**

## Documentation

- `song-wars-build-spec.md` — the original Phase 1 build spec (single-device prototype).
- `upgrade/SONG-WARS-UPGRADE.md` — the v2 upgrade spec (synced multiplayer playback, Best of 5, Double or Nothing, design system).
- `upgrade/song-wars-upgrade/RESEARCH-PHASE1.md` — research notes behind the v2 sync/audio decisions.
- `supabase/README.md` — how the database schema/migrations are organized.

## Local setup

```bash
npm install
cp .env.local.example .env.local   # fill in your Supabase project's URL + anon key
npm run dev
```

Requires a Supabase project with `supabase/schema.sql` run against it (see `supabase/README.md`).

## Architecture

**Frontend**: React + Vite, no router (the whole app is one state machine in `App.jsx` driven by a single `phase` variable — `lobby` → `waiting` → `wheel-genre`/`wheel-artist`/`wheel-waiting` → `round-loop` → (`bonus-offer` → `bonus-genre-pick` → `bonus-artist-wheel` →) `round-loop` → `end`).

**Backend**: Supabase (Postgres + Realtime + Row Level Security), no custom server. Game rules are enforced two ways:
- RLS policies and `SECURITY DEFINER` triggers/RPCs in Postgres itself (e.g. a submission only becomes visible to the opponent once both players have submitted — enforced by the database, not by the client choosing not to render it).
- Optimistic-concurrency guarded writes (`UPDATE ... WHERE <expected current value>`) for anything two clients might race to do — round advancement, starting the reveal sequence, offering Double or Nothing, etc. Whichever client's write lands first wins; the other is a harmless no-op. This pattern is used throughout instead of a lock/mutex.

**`src/App.jsx`** is the orchestrator: owns the `phase` state machine and wires together three custom hooks:
- `hooks/useRoomConnection.js` — the live data layer (players, the shared game row, current-round submissions/votes), one realtime subscription.
- `hooks/useRoundState.js` — everything about the round currently being played (submission/vote derivation, the reveal→vote sub-steps, recording each round's outcome into local history exactly once). This is the densest hook and the one most likely to need changes for future round-loop features.
- `hooks/useAudioPriming.js` — the persistent `<audio>` element trick that lets synced playback work on iOS Safari (see the research notes for why).

**`src/lib/`**: `game.js` (round-loop DB operations), `room.js` (lobby/join DB operations), `match.js` (pure Best-of-5/sudden-death rule logic — no Supabase dependency, unit-tested directly), `itunes.js` (song search), `supabase.js` (client + anonymous auth), `uuid.js`/`roomCode.js` (small helpers).

**`src/components/`**: mostly presentational. `SongBox.jsx` is the shared card used across reveal/replay/voting; `Wheel.jsx` and `FitText.jsx` handle the spin wheel and its shrink-to-fit labels.

## Testing

There's no browser-based test suite — testing happens by actually playing the game. What *is* automated:

```bash
node scripts/test-match-logic.mjs                                  # pure rules-engine unit tests, no network
node --env-file=.env.local scripts/smoke-test-supabase.mjs          # room/join/hidden-submission flow against the live DB
node --env-file=.env.local scripts/smoke-test-round-loop.mjs        # submit/vote/forfeit flow against the live DB
node --env-file=.env.local scripts/smoke-test-phase3.mjs            # reveal/skip/replay guarded writes against the live DB
node --env-file=.env.local scripts/smoke-test-phase4-5.mjs          # Double or Nothing guarded writes against the live DB
```

Run these after any schema or `lib/game.js`/`lib/room.js` change before asking someone to playtest — they catch RLS/guard regressions immediately instead of an hour into a live game.

## Deployment

`main` auto-deploys to production via Vercel on every push. Feature work happens on a branch (Vercel gives it its own preview URL, protected by Vercel Authentication by default) and gets merged to `main` once playtested.
