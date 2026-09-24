# Song Wars v3 — Upgrade Plan

Sep 24, 2026 · @T

Building on the v2-as-built baseline (2-player, Best of 5, single mode). v3 direction: party-size lobbies (5-8 players), difficulty levels, new game modes, content expansion, and polish. This doc captures what's been decided so far and what's still open.

## Difficulty levels

A ladder of how much control a player has over their locked artist, all drawing from the same curated genre/artist pool — difficulty changes the selection method, not the catalog:

- **Hard** (the current v2 base game): spin for genre, then spin for artist — both random
- **Medium**: pick genre from a list, then spin the artist wheel (random, but scoped to the chosen genre)
- **Easy**: pick both genre and artist directly — no spinning. Artist choice is limited to the existing ~5-artist curated pool for that genre, not a free/open search

Why Easy stays limited to the curated pool: the submission-validation system checks that a picked song's artist matches the player's locked artist, which only works reliably against a known list. Free-typing any artist within a genre would need a way to verify that artist actually belongs to that genre, and there's no free genre-tagging API in the current stack to do that. Keeping all three levels on the same pool also keeps difficulty a spectrum of control, not catalog size — if the pool ever feels too narrow, that's the separate content-expansion effort, not an Easy-only fix.

Who sets it: the host, once per lobby (see Lobby flow) — not per-player. It's picked live in the lobby alongside mode, not locked in before the room code is even shared.

## Lobby flow

Open lobby, no pre-declared player count. Following the pattern used by Kahoot/Jackbox-style games rather than having the host guess a headcount up front: the room code is shareable as soon as the room exists, players trickle in, and the host starts whenever ready with whoever's there. This avoids locking out a latecomer just because the host guessed a lower number earlier.

**Host flow**
1. Create room → room code generates and is shareable immediately
2. Host lands in a live lobby screen: shows players joining in real time, the mode list, and the difficulty selector
3. Each mode shows its own live eligibility based on current headcount — e.g. a mode needing 3+ shows as locked ("needs 3+, you have 2") until enough players have joined; Bracket-style modes that need an even number show that requirement too
4. Difficulty (Easy/Medium/Hard) can be picked any time, since it doesn't depend on headcount
5. "Start" enables once the host has an eligible mode selected and enough players joined

**Joiner flow**
1. Enter the room code
2. Land in a waiting lobby — sees other players who've joined, and mode/difficulty once the host has picked them
3. Waits for host to start

This replaces an earlier idea of the host picking mode + difficulty before sharing the code — that didn't work once mode availability depends on how many people actually show up, which isn't known yet at that point.

## Player identity: avatars (Final Phase v3)

When a player enters their name (joining or hosting), they can also pick an avatar to sit above it — either a photo from their device's gallery, or a GIF picked via search. In scope for v3, but treated as its own final phase — built and tested only after every other v3 item (difficulty levels, lobby flow, the four in-scope modes, the featured-artist bug fix) is done, rather than in parallel with them.

Scope: one-time per game. No persistence across games — picked fresh each time a player joins a room, consistent with the app's existing no-accounts model (Supabase anonymous sign-in, a fresh session per browser tab). No new identity/profile system needed.

**GIF search — API choice: KLIPY, not GIPHY or Tenor:**
- Tenor is dead — Google fully shut down the Tenor API on June 30, 2026 (new signups were blocked back in January); any app still calling it now gets errors. Not usable.
- GIPHY still works, but its free tier is tight (roughly 42-50 requests/hour on a public key), and "production" access with higher limits requires an application through their developer portal with terms that aren't fully public. Workable for testing, risky to build a real feature around.
- KLIPY is a genuinely free-tier GIF/sticker search API with simple API-key auth and endpoints that mirror GIPHY's shape (search, trending, get-by-ID), making it a familiar integration. Notably, Discord reportedly migrated to KLIPY after the Tenor shutdown — a decent signal it holds up at real scale.
- Recommendation: build against KLIPY; keep GIPHY as a documented fallback only if KLIPY's content coverage ever feels thin.

**Photo upload**: no external API needed — a native file picker (`<input type="file" accept="image/*">`) uploading straight to Supabase Storage, which the app already uses for its backend. Keeps everything on one service.

**Open items**
- Whether to apply a content rating filter on GIF search (KLIPY, like GIPHY, likely supports a rating parameter) — probably low priority for a private friend-group game, but worth a quick check
- Attribution requirements: GIF platforms typically require a small "Powered by KLIPY" style credit somewhere in the UI — needs confirming against KLIPY's actual terms before launch
- Note for v4: avatars will need to be hidden during Blind Mode's playback/voting screens, not just player names, or that mode's anonymity gets undercut — deferred to v4 rather than solved now

## Game modes

Status: in progress. Bracket/Matchup is deferred to v4 (parallel-vs-staggered playback wasn't resolved, and it's the most complex mode to build — not worth blocking v3 on it). The remaining four are in scope for v3, though brand-new mode ideas from the user haven't been shared yet.

| Mode | Concept | Player requirement | Status |
| --- | --- | --- | --- |
| Elimination ("Last DJ Standing") | Everyone submits into one round; lowest-voted player is eliminated each round instead of a fixed Best-of-5 | 3+ | In scope — tiebreak rule now defined (see below) |
| Theme Night | Host locks the whole match to one theme (e.g. "90s Night"), filtering prompts and genre/artist pool to match | Any | In scope — confirmed as its own mode, not a toggle |
| Blind Mode | Submissions stay anonymous through playback and voting, revealed only after votes are cast | Any | In scope |
| Lightning Round | Shorter timers, one song per matchup instead of two, quicker votes | Any | In scope — could later apply as a speed variant on top of other modes |
| Bracket/Matchup | Players paired head-to-head, winners advance | Even number works best | Deferred to v4 |

**Elimination mode — tiebreak rule (confirmed)**: when two or more players tie for fewest votes in a round, a sudden-death mini-round is played among just the tied players — same round loop (prompt, submit, play, vote), scoped to only that group. Exactly one player is eliminated from it: whoever places lowest in that mini-round. If the mini-round itself produces another tie (e.g. 3 players tied, and 2 of them tie again in the sudden-death), the sudden-death repeats among that smaller tied group until exactly one player is eliminated. This scales to any lobby size — works the same whether 2 players are tied in an 8-person lobby or 3 are tied in a 4-person one.

Why open lobbies matter here: Elimination specifically needs 3+ players to make sense, so under the open-lobby model (see Lobby flow) it shows as locked in the host's mode list until enough players have joined, rather than the host having to guess ahead of time whether they'll have enough people.

## Carried-over bug: featured-artist matching — RESOLVED, fix approach chosen

Confirmed real in v2. The artist-lock check compares a submitted track's artist against iTunes' `artistName` field, which only reports the primary artist. A collab like "Freaky Friday" (Lil Dicky ft. Chris Brown) returns `artistName: "Lil Dicky"` — so a player locked to Chris Brown gets wrongly rejected for submitting it, even on the "Best feature" prompt that exists specifically for this case.

**Decided**: fallback title/credits match, not a manual-override path. When the strict `artistName` check fails, also check whether the locked artist's name appears in the track's title/credits string (catches "feat. X" / "ft. X" style credits). No new UI, ships independent of the rest of v3.

## Base game match format at party size — RESOLVED

**Decided: Points league.** Every round, all players (not just 2) submit and vote; the round winner (most votes received) earns a point; a fixed number of rounds is played; highest total points at the end wins the match. Chosen over "last one standing" (which would make the base game and Elimination mode largely redundant with each other) and a "top-2 playoff finale" (more dramatic, but more to build and not needed to make the format work at 5-8 players). This is the model every party-size feature (lobby capacity, scoring, RLS policies, round-outcome logic) gets built against.

Still open under this: exact round count for the base game at party size, and how ties in final point totals are broken — not blocking the start of the work, but needs an answer before the scoring UI is finished.

## Open decisions

**Still need your input**
- Your own new mode ideas — mentioned but not yet shared; still need these to round out the v3 mode list
- Content expansion specifics — how many more artists/genres/prompts, and which genres feel thin
- Polish specifics — which animations/sound/visual updates matter most
- Exact round count for the base game (Points league) at party size, and how final-score ties are broken
- Bracket mode's odd-player handling — bye round, spectate, or something else when headcount doesn't divide evenly (not blocking, since Bracket is deferred to v4)

**Decided so far**
- Base game match format at party size: Points league — see above
- Featured-artist bug fix: fallback title/credits match — see above
- Party-size lobbies: 5-8 players, no hard cap enforced
- Individual competition (not teams) even with more players
- Difficulty levels (Easy/Medium/Hard) are host-set per lobby, not per-player
- Easy-mode artist picks stay limited to the curated pool, not open search
- Open lobby model: no pre-declared player count; mode eligibility is live based on current headcount
- Bracket/Matchup mode deferred to v4; Elimination, Theme Night, Blind Mode, and Lightning Round are in scope for v3
- Elimination mode's tiebreak: sudden-death mini-round among tied players, repeating on further ties, until exactly one player is eliminated
- Host picks mode + difficulty live in the lobby screen (after the code is shareable), not before
