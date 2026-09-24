# Song Wars — Upgrade Spec (v2)

This document lists the changes to make to **Song Wars**, which is already live at `song-wars-lime.vercel.app`. The original build spec (`song-wars-build-spec.md`) describes how the game was planned, but the live code may differ from it. **The live code is the source of truth for how things work today; this document is the source of truth for what should change.**

## How to work on this (read first)

1. **Read the existing code before changing anything.** Map out how the wheel, round loop, playback, voting and Supabase sync currently work, and note anywhere the code differs from `song-wars-build-spec.md`.
2. **The game is live. Don't break it.** Work on a separate branch, make changes in the phase order below, and keep the game playable after each phase.
3. **Do the research items first** (Phase 1) and report back before building anything that depends on them.
4. **Do not implement anything in "Open decisions".** Those are still being decided. If a change you're making touches one of them, stop and ask.
5. **After each phase, give a short summary**: what changed, which files, anything that didn't work as planned, and how to test it on a phone.
6. Each item has an ID (e.g. `[R1]`, `[W1]`). Use the IDs in commit messages and summaries.

## Build phases (do in this order)

| Phase | Items | Why this order |
| --- | --- | --- |
| 1. Research | `[X1]`–`[X4]` | Audio and sync findings decide how Phase 3 is built |
| 2. Wheel screen fixes | `[W1]`–`[W4]` | Small, visible fixes with no dependencies |
| 3. Song playback, replay & voting | `[P1]`–`[P4]` | Fixes the biggest live bug (songs clashing) |
| 4. Best of 5 & round screens | `[R1]`, `[S1]` | Core rule change |
| 5. Double or Nothing | `[R2]`, `[S2]`, `[W3]` | Builds on Phases 2–4 |
| 6. Mobile polish pass | `[M1]` | Final review of every screen, including new ones |

---

## Full round flow (after all changes)

Use this as the reference for how screens connect.

```
GAME START
  Spin for Genre wheel → "Your genre" pop-up
  Spin for Artist wheel → "Your artist" pop-up
  (artist locked for the whole main game)

EACH ROUND
  Round announcement screen ("Round 1" / "Sudden Death" ...)   ~3s
  Prompt shown → both players search & submit (existing 60s timer)
  Coin flip decides play order
  3-second countdown
  Song 1 auto-plays on BOTH phones
  5-second "Up next" pause
  Song 2 auto-plays on BOTH phones
  Replay screen (one replay per song, 10s windows)
  "Vote for the best song" transition                          ~2s
  Voting screen (existing vote timer)
  → next round announcement, Sudden Death, or end of main game

END OF MAIN GAME
  Loser: Double or Nothing offer (15s)   |   Winner: "Waiting for opponent…"
    End Game → end screen
    Double or Nothing → Pick Your Genre → Spin for Artist → "Your artist" pop-up
                        → bonus match (best of 3, same round flow)
                        → end screen
```

---

## Phase 1 — Research (report back before building)

### [X1] Audio autoplay on phones
iPhones (Safari) and many mobile browsers block audio that starts without a user tap. The new playback `[P1]` starts songs automatically, so this must be solved first.
- Find the reliable approach (usually "unlocking" audio on an earlier tap in the round, such as the Submit button).
- Confirm it works on **iPhone Safari** and **Android Chrome**.
- **Report:** what approach you'll use and any limitations.

### [X2] Synced playback between the two phones
Auto-play, replays and skips must happen on both phones at the same time `[P1]`–`[P3]`.
- Propose how to keep both phones in sync closely enough (e.g. the server sends a shared start time and both clients schedule playback against it).
- Handle both players tapping different song boxes at the same moment: **first tap wins**, the second is ignored.
- **Report:** the approach and roughly how far apart the two phones may be.

### [X3] Mobile and Apple standards
Review Apple's Human Interface Guidelines and mobile Safari best practices. These findings feed into `[M1]`.

### [X4] Similar open-source games on GitHub
Look for open-source games similar to Song Wars (real-time multiplayer, party, or music games) and note good patterns for mobile layout, text scaling, wheels, synced audio and game-state flow. **Report:** the repos you looked at and what's worth borrowing.

---

## Phase 2 — Wheel screen fixes

### Current state (screenshots)

| Genre wheel (current) | Artist wheel (current) |
| --- | --- |
| ![Genre wheel](screenshots/wheel-genre-current.png) | ![Artist wheel](screenshots/wheel-artist-current.png) |

**Problems visible in these screenshots:**
- Labels sit **outside** the wheel, on the dark background, in dark text, so they're almost invisible.
- Several labels are **upside down** (Latin/Reggaeton, Dancehall/Reggae, Karol G).
- Labels **overlap** other elements: "Soul/Funk" is under the pointer; "Afrobeats" runs into the Spin button.
- Labels appear to line up with the **edges between slices** instead of the middle of each slice, so it's unclear which slice a name belongs to.
- Long names wrap to two lines ("Daddy Yankee"), and longer names ("Red Hot Chili Peppers", "Earth Wind & Fire") will be worse.

### [W1] Wheel labels
- Put each label **inside its own slice, centered** in the slice.
- Text reads **outward from the center**, so no label is ever upside down.
- Text is **white, bold, with a subtle dark shadow**, readable on every slice color, including light ones (yellow, lime).
- Long names **shrink to fit on one line**; never wrap or spill out of the slice.
- **The result the game records must match the slice the pointer visually lands on.**

**Done when:** every genre and artist name is readable, inside its slice, right way up, on one line, on a small iPhone screen, and the recorded result always matches what the pointer shows.

### [W2] Wheel titles and button
- Replace `YOUR WHEEL — 1 OF 2` with a title above the wheel: **"Spin for Genre"**.
- Replace `YOUR WHEEL — 2 OF 2 (LATIN/REGGAETON)` with **"Spin for Artist"**, with the chosen genre shown as a **smaller line underneath** (e.g. "Latin/Reggaeton").
- Change the button text from "Spin for genre" / "Spin for artist" to just **"Spin"**.

### [W3] "Pick Your Genre" screen (Double or Nothing only)
In Double or Nothing `[R2]`, the loser **picks** a genre instead of spinning. Title this screen **"Pick Your Genre"**, show the 12 genres as tappable options, then go to the Spin for Artist wheel as normal.

### [W4] Wheel result pop-up
When the wheel stops, show a **small rectangular pop-up** centered on screen for about **2 seconds**, then move on automatically.
- **Top line (smaller):** "Your genre" or "Your artist". No colon.
- **Bottom line (larger, bold):** the result, e.g. **LATIN/REGGAETON** or **BAD BUNNY**, always on one line.
- After the genre pop-up → Spin for Artist wheel. After the artist pop-up → continue into the game.
- In Double or Nothing, only the artist pop-up appears (genre was picked, not spun).
- Fine-tune sizing and animation so it looks good on phones (see `[M1]`).

---

## Phase 3 — Song playback, replay & voting

**Bug this fixes:** currently each player presses play on their own phone. When one player plays Song 1 and the other plays Song 2 at the same time, the songs clash. **The game should play the songs, not the players.**

### [P1] Automatic synced playback
After both songs are submitted and the coin flip decides the order:
1. Both players see a **3-second countdown**.
2. **Song 1 plays automatically on both phones at the same time.**
3. A **5-second pause** shows "Up next" with Song 2's cover.
4. **Song 2 plays automatically on both phones.**
5. Go to the replay screen `[P3]`.

Players cannot start or stop playback during this part.

**Skip Song button:** shown below the song boxes whenever a song is playing (auto-play or replay). **If either player taps it, the song is skipped on both phones** and the game moves to the next step.

**Done when:** two phones in the same room hear the same song at the same time, songs never overlap, and Skip works on both phones from either phone.

### [P2] Song boxes (UI)
- Two boxes **side by side**, one per player's song.
- The song's **cover art fills the whole box**; song title and artist underneath.
  - Example: left box: *Hotline Bling* cover, "Hotline Bling — Drake"; right box: *Freaky Friday* cover, "Freaky Friday — Lil Dicky ft. Chris Brown".
- The box of the song currently playing is **highlighted** with a **"Now playing"** label.
- The same two boxes are used on the playback, replay and voting screens.

### [P3] Replay screen (one replay per song)
Opens after both songs have auto-played.
- Each song can be replayed **once**.
- When either player taps a box, **that song replays on both phones**, then its box **locks** (grayed out, labeled "Replayed").
- The other song's box stays **unlocked** until it's used.
- After the auto-play, and again after each replay finishes, there is a **10-second window** to tap a box.
- If nobody taps within 10 seconds, **or** both songs have been replayed, move to voting automatically.
- Skip Song works during replays.
- If both players tap different boxes at the same moment: **first tap wins** (see `[X2]`).

**Why:** this stops the game getting stuck with players replaying songs over and over, while still letting them hear each song once more.

### [P4] Vote transition and voting screen
1. Transition screen: **"Vote for the best song"**, about **2 seconds**.
2. Voting screen shows the same two song boxes. **Tapping a box casts your vote** (replays are over by this point).
3. **Keep the existing vote timer**; it already works well.
4. When the timer ends → next round announcement `[S1]`, Sudden Death, or end of the main game (with the Double or Nothing offer `[S2]`).

---

## Phase 4 — Best of 5 & round screens

### [R1] Best of 5
Replaces the fixed 10 rounds everywhere in the code.
- The game **ends as soon as a player reaches 3 round wins**.
- If nobody has 3 wins after round 5 (because some rounds were draws), play **sudden-death rounds** one at a time until someone wins a round.
- Prompts are still drawn from the pool with **no repeats** within a game.

**Done when:** a 3–0 game ends after round 3, a 3–1 game after round 4, and a game still undecided after round 5 goes to Sudden Death.

### [S1] Round announcement screen
Before every round, both players see a **full-screen announcement** for about **3 seconds**, showing the round label and the current score.

| Situation | Label |
| --- | --- |
| Main game | "Round 1" … "Round 5" |
| Main game, undecided after round 5 | "Sudden Death" |
| Bonus match | "Double or Nothing: Round 1" … "Round 3" |
| Bonus match, undecided | "Double or Nothing: Sudden Death" |

---

## Phase 5 — Double or Nothing

### [R2] Double or Nothing rules
- After the main game, the **loser** is offered Double or Nothing `[S2]`. **Only the loser decides**; the winner can't refuse.
- If accepted:
  - The loser **picks a genre** `[W3]`, then spins the artist wheel for an artist in that genre `[W4]`.
  - The **winner keeps their original artist.**
  - Bonus match is **best of 3** (first to 2 round wins), with sudden death if undecided.
  - Uses prompts **not already played** in the main game.
- **Stakes:**
  - Loser wins the bonus match → **the loser wins the game.**
  - Loser loses the bonus match → **the winner wins with a "Double Win"** shown on the end screen.
- Can only be played **once per game**.

### [S2] Double or Nothing offer screen
When the main game ends:
- **Loser sees:** the final score, two buttons, **Double or Nothing** and **End Game**, and a **15-second countdown**. If time runs out, the game ends normally.
- **Winner sees:** "Waiting for opponent to decide…"
- End Game → both players go to the end screen.
- Double or Nothing → both players go to the Pick Your Genre screen `[W3]` (the winner sees a waiting message while the loser picks and spins).

---

## Phase 6 — Mobile polish pass

### [M1] Optimize every screen for phones, especially iPhone
Using the findings from `[X3]` and `[X4]`, review **every screen** (including the new ones) and fix anything that falls short:
- **Text and scaling:** sizes, spacing and layout adapt to the screen, from small iPhones to large Android phones. Nothing cut off, overlapping, or too small to read. Includes fine-tuning the wheel labels `[W1]` and result pop-up `[W4]`.
- **Tap targets:** buttons and song boxes are easy to tap with a thumb (Apple recommends at least 44 points).
- **Screen edges:** content stays clear of the notch, Dynamic Island and home bar (use safe-area insets).
- **Safari quirks:** the page must not zoom in when a player taps the song search box (inputs need a font size of at least 16px), and layouts must not jump when Safari's address bar shows or hides.
- **Audio:** confirm synced auto-play works on iPhone (ties to `[X1]`).
- **Testing:** check every screen at common iPhone and Android sizes.

**Report:** a short list of what you found and changed, so it can be reviewed before going live.

---

## Open decisions — DO NOT IMPLEMENT YET

These are still being decided. Don't change related behavior; ask if you run into them.

- **Matchup screen:** a possible "Bad Bunny vs Drake" screen before Round 1 showing both players' artists. Not confirmed.
- **Voting and ties:** with only 2 players voting, rounds can easily end in draws (e.g. each player votes for their own song). **Please report how the live game currently handles self-voting and ties**, since this affects how often Sudden Death happens.
- **Featured songs:** the server checks that a submitted song's artist matches the player's locked artist. This may wrongly reject songs where the locked artist is only featured (e.g. Chris Brown on Lil Dicky's *Freaky Friday*), even though "Best feature" is a round prompt. **Please report how the live check currently behaves** with featured songs.
