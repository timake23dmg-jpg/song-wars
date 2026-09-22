# Song Wars — Build Spec

A 2-player real-time music game. At the start, each player independently spins a genre wheel then an artist wheel, locking into that artist for the whole game. Each of the 10 rounds shows a prompt ("best love song," "best feature," etc.); both players search their locked artist's catalog for a fitting song, submit it within a timer, and both songs play before a vote decides the round's winner.

## Core round loop

1. A **round prompt** is shown to both players (e.g. "best love song," "best feature") — pulled from a prompt list, separate from genre/artist, and it's the only thing that changes round to round
2. Both players search within their own locked artist's catalog for a song fitting the prompt, and submit it — with a **60-second timer**
3. If both players submit before the 60 seconds are up, the timer ends immediately rather than running out the full minute
4. Submissions are held server-side and hidden from the other player until both have submitted (or time runs out)
5. Once both are in, the server **flips a coin** to decide play order
6. Player A's song plays first (15–30 sec clip), then Player B's
7. After both have played, a **new voting screen** opens
8. Both players vote for which song was best — gets its own short timer too (e.g. 15s), since no part of the round loop should be able to stall indefinitely on one player; a missed vote counts as no vote cast, not an automatic loss
9. The winning song's player gets a point; tally updates
10. Next round begins with a new prompt — fixed at **10 rounds total**, final tallies and scores shown at the end

If a player doesn't submit before the timer runs out, that round auto-forfeits to the other player.

## Wheel setup: genre & artist

One mode, not two.

At the start of the game, **each player spins their own wheel, independently**:

1. First spin lands on a **genre** (Pop, Hip-Hop/Rap, R&B, Rock, Afrobeats, Latin/Reggaeton, Dancehall/Reggae, Country, Electronic/Dance, Alternative/Indie, Soul/Funk, K-Pop)
2. Second spin lands on an **artist from within that genre** (each genre has its own pool of ~5 popular artists)

Whatever artist a player lands on, they're **locked in for the entire game (10 rounds)** — e.g. Player 1 spins into Drake, Player 2 spins into Chris Brown, and every round from here on, each searches within their own artist's catalog.

Genre and artist are picked once, at the very start, and never spin again during that game.

## Content pipeline: genre & artist pools

Starting pool, ~5 artists per genre — still open for edits before it's locked into the database.

| Genre | Artists |
| --- | --- |
| Pop | Taylor Swift, Ariana Grande, Bruno Mars, Dua Lipa, Ed Sheeran |
| Hip-Hop/Rap | Drake, Kendrick Lamar, Future, Kanye West, J. Cole |
| R&B | SZA, The Weeknd, Chris Brown, Beyoncé, Usher |
| Rock | Coldplay, Imagine Dragons, Foo Fighters, Red Hot Chili Peppers, Linkin Park |
| Afrobeats | Burna Boy, Wizkid, Davido, Rema, Tems |
| Latin/Reggaeton | Bad Bunny, J Balvin, Karol G, Ozuna, Daddy Yankee |
| Dancehall/Reggae | Sean Paul, Shaggy, Vybz Kartel, Popcaan, Bob Marley |
| Country | Morgan Wallen, Luke Combs, Chris Stapleton, Kacey Musgraves, Carrie Underwood |
| Electronic/Dance | Calvin Harris, David Guetta, Marshmello, Avicii, Kygo |
| Alternative/Indie | Tame Impala, The 1975, Arctic Monkeys, Glass Animals, Billie Eilish |
| Soul/Funk | Stevie Wonder, Earth Wind & Fire, Anderson .Paak, Erykah Badu, Marvin Gaye |
| K-Pop | BTS, BLACKPINK, Stray Kids, TWICE, NewJeans |

No "Best Feature" genre — that idea was dropped; "best feature" instead lives as a **round prompt** (see Core round loop), so it applies within whichever artist a player is already locked to, not as a separate genre spin.

## Round prompts

Finalized list — the game draws 10 (no repeats) from this pool each game, so across sessions the mix stays fresh.

**Emotional/vibe-based**: Best love song · Best sad/heartbreak song · Best hype/gets-you-pumped song · Best chill/relax song · Best song to cry to · Best angry/rage song · Best feel-good song

**Situational**: Best song to drive to · Best song for a party · Best song for a workout · Best song to end the night on · Best song for a road trip · Best summer song · Best song to get freaky to 😈

**Craft/performance-based**: Best feature (a song where the artist is a guest, not the lead) · Best opening track · Best hook/chorus · Best lyrics/storytelling · Most underrated song (deep cut) · Best collab

**Nostalgia/legacy**: Best throwback · Best song from their breakout era · Song that best represents the artist overall

21 prompts total — more than the 10 needed per game, so each playthrough draws a random subset and no two games feel identical.

## Song search & audio

Players need to search essentially any song, not pick from a fixed list — this needs a real search API, not a curated dataset like the trivia game. Since each round is scoped to a specific artist (from the wheel spin), the search box should pre-filter or bias results to that artist so players aren't stuck typing the artist name themselves every round.

On top of biasing the search, the server should **validate the submitted track's artist field actually matches the player's locked artist** before accepting it (iTunes results include an `artistName` field for exactly this check) — a comparable guessing-game repo (spotify-guessing-game) does genre/artist-scoped selection the same way, and without server-side validation a player could technically submit any song.

**Recommendation: iTunes Search API**, same as the trivia game plan, for consistency and because it stays free with no auth:

- Search by title/artist as the player types → live results with artwork
- Each result includes a direct `previewUrl` (30-sec clip) that plays instantly, no login, no ads
- Covers a very large catalog — more than enough for casual play

**Alternative considered: Spotify Web API.** Has a larger, more current catalog and matches what people expect from "Spotify-style search," but requires setting up app credentials (client ID/secret) even for search-only use, and Spotify has removed 30-second preview URLs for a large share of tracks since 2024, so playback isn't guaranteed the way it is with iTunes. Spotify's developer terms also explicitly prohibit building games/trivia on their API — one more reason iTunes is the safer, simpler starting point rather than just a convenience choice.

If a chosen song has no preview available, the app should flag it at submission time and ask the player to pick a different match, rather than discovering it's unplayable at reveal.

## Voting & scoring

After both clips have played, a dedicated vote screen opens (separate from the reveal/playback screen) and each player casts one vote for the song they think is best.

- **Self-voting**: whether a player can vote for their own submission is still open — flagged below, since with only 2 players this changes how ties work
- **Winning the round**: the song with more votes wins; that player earns 1 point
- **Tie handling**: if votes split evenly (e.g. each player votes for their own, if self-voting is allowed), the round is a draw — no point awarded
- **Game length**: fixed at 10 rounds; running score shown throughout
- **End screen**: final tally, winner, and a recap list of the winning song from each round (a "best of the night" playlist)

## Multiplayer & real-time sync

**Backend: Supabase** (free tier) — real-time channels plus a normal Postgres database in one place, no server to run yourself.

**Room flow**
- Host creates a room → short room code
- Friend joins with the code → locks to exactly 2 players
- Game starts, wheel spins begin. A player can also explicitly leave/end the game (not just disconnect) — a comparable open-source game (chain_wars) handles this as its own "rematch or leave" action so an intentional exit doesn't just look like a timeout

**Keeping picks hidden until reveal**: this is the one tricky sync requirement here (the trivia game didn't need it). Each player's submitted song must be stored server-side but withheld from the other client until both have submitted — never sent to the other player's browser early, since a client-side "hide it in the UI" approach could be inspected. The server only releases both picks once both are in.

**Concrete pattern (seen in a comparable open-source game, chain_wars)**: use Supabase Row Level Security so the submissions table simply cannot be read by the other player's client until both are in — not just "the app chooses not to show it." A player's own submission is readable by them via a private token/row; the opponent's row is blocked at the database level until a server-side check flips a `revealed` flag once both are present. This is safer than a client-side hide, since a technically curious player could otherwise inspect network requests and see the pick early.

**Timing**: the 60-second pick timer is server-authoritative, so both players see a synced countdown regardless of network latency — and the server ends it early the moment both players have submitted.

**Disconnects**: a dropped connection before submitting counts as a forfeit for that round once the timer expires. Full reconnect-and-resume is a known hard problem in this kind of build — a comparable open-source game (chain_wars) explicitly ships its v1 without it, since session state tied only to an in-memory connection doesn't survive a page refresh cleanly. Recommendation: treat basic rejoin-with-room-code as a Phase 4 stretch goal rather than a Phase 1 requirement, so a flaky connection doesn't block getting a playable game working first.

## Tech stack & architecture

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | Web app (React), mobile-first responsive layout | Works on both phones via a link, no app install |
| Realtime backend | Supabase (free tier) | Realtime channels + Postgres + auth together, no server ops |
| Artist & genre pools | Supabase Postgres tables: artist list, genre/theme list | Powers both wheels |
| Song search & clips | iTunes Search API | Free, no key, live search, direct preview URL |
| Hosting | Vercel or Netlify (free tier) | One shareable link, auto-deploys from the repo |
| Wheel UI | React spin-wheel library (e.g. CrazyTim/spin-wheel, MIT-licensed) | Saves build time vs. a custom spin animation; a comparable open-source party game uses this same library |

**Data flow**

1. Game start: each client spins its own genre wheel, then its own artist wheel → server records each player's locked artist for the game
2. Each round: server shows the round's prompt (drawn from the prompt list) → both players search iTunes (biased to their own locked artist) and submit a track within the 60s timer (ends early if both submit first)
3. Server holds both submissions hidden until both are in or time expires
4. Server flips a coin → decides play order → clients play song A's clip (15–30 sec), then song B's
5. Vote screen opens on both clients → each casts one vote → server tallies, awards the point, updates the scoreboard
6. Repeat for 10 rounds → final tally screen

## Open decisions & build phases

**Resolved**
- 21 round prompts finalized (see Round prompts section)
- One unified mode: each player independently spins genre → artist at the start, locked for all 10 rounds (no more Mode 1/Mode 2 split)
- 12 genres confirmed: Pop, Hip-Hop/Rap, R&B, Rock, Afrobeats, Latin/Reggaeton, Dancehall/Reggae, Country, Electronic/Dance, Alternative/Indie, Soul/Funk, K-Pop
- Starting artist pool: ~5 popular artists per genre, being refined together (see Content pipeline above)
- 60-second submission timer, ending early if both players submit first

**Need your input**
- **Self-voting**: can a player vote for their own submission? Still affects tie handling
- **Artist pool finalization**: once the per-genre lists are locked, they seed the database

**Fine as defaults, flag if you want changes**
- Clip length: 15 vs 30 seconds
- Optional stretch idea: a limited "reroll prompt" (e.g. once per game) if a player is genuinely stuck finding a fitting song — not core, but worth considering once the base loop is working
- Optional future resource: if the artist pool ever needs to grow beyond hand-picked lists, mhollingshead/billboard-hot-100 on GitHub is a free, ready-made historical Billboard dataset that could help expand it later
- Visual style/branding: not yet specified — default to a clean, mobile-first look

**Suggested build phases**
1. **Phase 1 — Core loop, single device**: genre/artist spin, prompt display, iTunes search + submit, coin-flip order, playback, vote screen, scoring — test the fun factor before networking
2. **Phase 2 — Real-time multiplayer**: Supabase integration, room codes, hidden-submission handling (Row Level Security), synced timer and spin animations
3. **Phase 3 — Content**: seed the finalized genre/artist pools and the round prompt list
4. **Phase 4 — Polish**: end-of-game recap, mobile layout pass, reconnect handling, explicit leave/forfeit action

Same approach as the trivia game: playable solo core loop first, multiplayer layered on top once that's solid.

## Setup & requirements (free stack, mobile-accessible via GitHub)

**On your computer (one-time setup)**

| Tool | Free? | Purpose |
| --- | --- | --- |
| VS Code | Free | Where you'll direct Claude Code and see the project files |
| Node.js 18+ & npm | Free | Runs the React app and its build tools |
| Git | Free | Version control, required to push to GitHub |
| Claude Code | **Not free** — needs a Claude Pro plan ($20/mo) or higher, or API billing | The AI agent that writes/builds the app from this spec |

Claude Code itself is the one piece of this stack that isn't free — it needs an active Claude Pro (or Max/Team) subscription, or an Anthropic API key with billing set up. Everything else below is free.

**Free accounts to create**

| Service | Free tier? | Purpose |
| --- | --- | --- |
| GitHub | Free | Stores the code; also where the live game gets deployed from |
| Supabase | Free tier | Real-time backend — room codes, live sync, scoring |
| Vercel or Netlify (or GitHub Pages) | Free | Hosts the live game at a public URL so it's playable from any phone browser |
| iTunes Search API | Free, no signup | Song search + preview clips |

**How "it sits on GitHub" works in practice**: the code lives in a GitHub repo either way. For the actual playable link, Vercel/Netlify auto-deploy straight from that GitHub repo every time it's updated (free, and gives a clean URL) — or GitHub Pages can host it directly from the repo itself with no separate service, if you'd rather keep everything under GitHub alone. Both work fine for this app since it's just a static frontend talking to Supabase.

**Mobile access, Kahoot-style**: no app install needed on either phone. One player opens the site, creates a game, and gets a short room code. The other opens the same site on their phone's browser, taps "Join," types the code, and they're in the same room — same flow as kahoot.it, just running on your own link instead.
