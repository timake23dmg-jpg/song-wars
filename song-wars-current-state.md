# Song Wars — Current State (v2, as built)

This documents what **Song Wars actually is and does today**, live at `song-wars-lime.vercel.app`. It supersedes `song-wars-build-spec.md` (the original single-device Phase 1 plan) and `upgrade/SONG-WARS-UPGRADE.md` (the v2 change instructions, now fully implemented) — both describe how the game got here, not what it currently does. This file is the accurate baseline for planning v3.

## What the game is

A 2-player real-time music game, played on two separate phones/devices over a shared link — no app install, Kahoot-style room codes. One player hosts, gets a 4-character code, shares it; the other joins with the code. Each player independently spins a genre wheel then an artist wheel and is locked into that artist for the whole match. Across a series of rounds, a prompt is shown ("best love song," "best hype song," etc.); both players search their own locked artist's catalog for a fitting song and submit it. Once both are in, a coin flip decides play order, both songs play automatically on both devices in sync, and both players vote for the best one. The match is decided Best of 5, with a Double or Nothing bonus round available to the loser.

## Full flow

```
LOBBY
  Host creates a room -> 4-character code (letters + numbers)
  Friend joins with the code -> room locked to 2 players
  Host taps "Start game"

WHEEL (each player independently, on their own device)
  Spin for Genre -> 2s result pop-up -> Spin for Artist (within that genre) -> 2s result pop-up
  Artist is locked for the rest of the main match

MAIN MATCH — Best of 5
  Each round:
    Round announcement (~3s): "Round 1"..."Round 5", or "Sudden Death" past round 5,
      showing the current score
    Prompt shown -> both players search & submit within a 60s shared timer
      (ends early the moment both have submitted; auto-forfeits to whichever
      player did submit if the timer runs out on the other)
    Coin flip decides play order (deterministic, both devices agree without
      a round trip)
    3s countdown -> Song 1 auto-plays on both devices -> 5s "Up next" pause
      -> Song 2 auto-plays -> Skip Song available on either device any time
      something is playing, ends it on both devices at once
    Replay window (5s): either unused song can be tapped to replay it once;
      resets after each replay; auto-advances once both songs are used or
      the window lapses with no tap
    "Vote for the best song" transition (~2s)
    Voting screen: each player has their own 15s timer to vote (including
      for their own song — self-voting is allowed); a missed vote counts as
      no vote, not an automatic loss
    Round score: most votes wins the round and a point; a tie awards no
      point to anyone
  Match ends as soon as a player reaches 3 round wins (e.g. a 3-0 sweep ends
  after round 3, not all 5). If nobody has 3 wins after round 5, Sudden
  Death: one round at a time, first to actually win a round (not tie) ends
  the match.

DOUBLE OR NOTHING (offered after the main match, once)
  Loser sees: final score, 15s to choose "Double or Nothing" or "End Game"
    (times out to End Game)
  Winner sees: "waiting for opponent to decide"
  If declined (or timed out) -> straight to end screen, main match result stands
  If accepted:
    Loser picks a genre from a tile grid (not a spin), then spins the
      artist wheel for an artist within it. Winner keeps their original
      artist unchanged.
    Bonus match: same round loop as the main match, but Best of 3 (first to
      2 wins, sudden death past round 3 if undecided), using prompts not
      already used in the main match
    Loser wins the bonus match -> loser wins the overall game
    Loser loses the bonus match -> winner wins, shown as a "Double Win" on
      the end screen

END SCREEN
  Winner announcement (+ "Double Win" badge if applicable)
  Score for whichever match actually decided the game (bonus match's own
    score if Double or Nothing was played, main match's score otherwise —
    not a combined tally, since winning the bonus match can flip who "won"
    without the cumulative round count agreeing)
  "Best of the night": every round played (main and bonus), in a table —
    prompt, winning song + artist + artwork, winner's name
  "Play again" -> reloads to the lobby
```

## Content

- **12 genres**, ~5 artists each (Pop, Hip-Hop/Rap, R&B, Rock, Afrobeats, Latin/Reggaeton, Dancehall/Reggae, Country, Electronic/Dance, Alternative/Indie, Soul/Funk, K-Pop) — `src/data/genres.js`.
- **21 round prompts** across emotional/situational/craft/nostalgia categories, drawn shuffled at game start (the whole pool, not just 10 — Best of 5 plus sudden death plus a possible Double or Nothing bonus match can run well past 10 rounds, and prompts never repeat within a game) — `src/data/prompts.js`.
- **Song search**: iTunes Search API, biased toward the player's locked artist, with a server-side check that the selected track's artist actually matches (substring match against iTunes' `artistName` field).

## Known gap, not yet fixed

**Featured-artist matching**: the artist-lock check compares against iTunes' `artistName` field, which is only the *primary* artist. A collab like "Freaky Friday" (Lil Dicky ft. Chris Brown) returns `artistName: "Lil Dicky"`, so a player locked to Chris Brown submitting it for a "Best feature" prompt gets wrongly rejected, even though that prompt exists specifically for this case. Confirmed real, not yet fixed.

## Tech stack

- **Frontend**: React + Vite, single-page, no router — the whole app is one `phase` state machine in `src/App.jsx`, delegating to custom hooks (`useRoomConnection`, `useRoundState`, `useAudioPriming`) and per-screen components.
- **Backend**: Supabase — Postgres + Realtime + Row Level Security, no custom server process. Game rules are enforced two ways: RLS policies + `SECURITY DEFINER` triggers/RPCs in Postgres itself (e.g. a submission only becomes visible to the opponent once both have submitted — enforced by the database, not the client), and optimistic-concurrency guarded writes (`UPDATE ... WHERE <expected current state>`) for anything two devices might race to do, so whichever write lands first wins and the other is a harmless no-op.
- **Hosting**: Vercel, auto-deploys `main` on every push.
- **Auth**: Supabase anonymous sign-in — no accounts, each browser tab gets its own session, used only so Row Level Security can tell "my row" from "the opponent's row."

Full architecture notes, the DB schema, and how to run the automated tests are in `README.md` and `supabase/README.md`.

## Design system

Deep navy background (`#090A25`), card panels (`#12143A`) with a visible border (`#2A2E66`), elevated rows/inputs (`#1B1E4D`). Single solid amber accent (`#FFB547`) with dark text-on-accent for primary actions. Headings in Bricolage Grotesque (800 weight), body text in DM Sans. Consistent radii: 24px cards, 16-20px buttons/song boxes, 14px inputs/list rows, 999px pills/badges. Full tokens in `src/index.css`.

## Open decisions (still unresolved, flagged in v2 too)

- **Matchup screen**: a possible "Player A's artist vs Player B's artist" screen before Round 1. Never built.
- **Self-voting**: currently allowed by design (with only 2 voters, disallowing it means every round is a guaranteed tie, since each player's only legal vote would be for the other).
