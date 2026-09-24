# Phase 1 Research — Song Wars Upgrade v2

Findings for `[X1]`–`[X4]` from `SONG-WARS-UPGRADE.md`, plus the two informational asks under "Open decisions." Written up here so we can come back and re-review before/while building Phase 3 (`[P1]`–`[P4]`) and Phase 6 (`[M1]`), which depend on this.

---

## [X1] Audio autoplay on phones

**Constraint:** iOS Safari blocks any `.play()` call unless it happens synchronously inside a real user-gesture event handler (tap/click/keydown). A `setTimeout`-scheduled or realtime-event-triggered `.play()` — which is exactly what synced auto-play needs — does **not** count as a gesture and will be silently blocked.

**Reliable approach — element priming:**
- The block is per `<audio>` **element instance**, not global. Once a specific element has had `.play()` called on it during a real gesture, Safari allows later scripted `.play()` calls on that *same* element without a new gesture.
- Fix: use **one persistent `<audio>` element** for the whole round (lifted above the per-song `RevealPlayback` component, not recreated per stage), and "prime" it during a real tap the player already makes right before reveal.
- Best priming moment in the current flow: the **Submit** button click in `SongSearch` — call `.play()` then immediately `.pause()` on the shared element inside that same click handler.
- Android Chrome's autoplay policy is more lenient generally, but the same priming technique works there too — one mechanism covers both platforms.

**Limitation:** requires restructuring playback around one shared, persistent audio element instead of the current per-stage element created fresh in `RevealPlayback.jsx`. Needs a small context/ref lifted to a shared location (e.g. App-level or a new `AudioProvider`) so the same DOM node survives the SongSearch → Reveal transition.

**Sources:**
- [Unlock JavaScript Web Audio in Safari and Chrome — Matt Montag](https://www.mattmontag.com/web/unlock-web-audio-in-safari-for-ios-and-macos)
- [To Play, or Not to Play — AutoPlay Policies for Safari 14 and Chrome 64 — Bitmovin](https://bitmovin.com/blog/autoplay-policies-safari-14-chrome-64/)

---

## [X2] Synced playback between two phones

**Approach:** same pattern already used in this codebase for the search timer (`games.round_started_at`) — one client writes a shared absolute timestamp to the `games` row (e.g. `reveal_started_at`), and every client computes its own `setTimeout` delay as `scheduledTime - Date.now()`. No NTP-style clock sync needed; typical websocket clock skew between two phones on the same network is sub-second, which is fine for a casual party game.

**Proposed schedule, all offsets from `reveal_started_at`:**
| Offset | Event |
| --- | --- |
| 0s | 3s countdown begins |
| 3s | Song 1 starts (up to ~20s clip) |
| 3s + clip length | 5s "Up next" pause, Song 2 cover shown |
| 3s + clip length + 5s | Song 2 starts |

**First-tap-wins for Skip / replay taps:** this is already a solved problem in this codebase — `advanceRound()` in `src/lib/game.js` uses an optimistic-concurrency guard (`UPDATE ... WHERE round_index = <expected>`) so a race between both clients resolves to exactly one winner, the other update matching zero rows. The same trick applies directly: a guarded `UPDATE ... WHERE <field> IS NULL` on a shared per-round row for Skip/replay events — whichever client's request reaches Postgres first wins, the second is a harmless no-op. No new pattern to invent, just apply the existing one to new fields.

**How far apart the two phones may be:** in practice, sub-second to low-single-digit-second drift is realistic for two phones on typical home Wi-Fi/cellular. Not imperceptible, but acceptable for this game's pacing (3s countdowns already build in slack).

**Sources:**
- [WebSockets with Elixir — How to Sync Multiple Clients — Viget](https://www.viget.com/articles/websockets-with-elixir-how-to-sync-multiple-clients)

---

## [X3] Mobile and Apple standards

- **Tap targets:** hard minimum 44×44pt for any interactive control (Apple HIG, unchanged since the original iPhone HIG; sub-44pt targets measurably increase tap error rates). Current wheel/vote/button sizing is already close to this; needs a explicit check once new elements (song boxes, Skip button, genre-pick tiles) are built.
- **Safe areas:** use `env(safe-area-inset-*)` for anything fixed/sticky near screen edges (notch, Dynamic Island, home indicator) — already used in this build's base styles; needs to be re-applied to any new full-screen overlays (round announcement, Double or Nothing offer, wheel result pop-up).
- **Safari zoom-on-focus:** any text input needs `font-size: 16px` minimum or Safari auto-zooms the page when it's focused. The app's root font size is the unstyled default (16px) and `.search-input` doesn't override it, so this is likely already fine — worth an explicit check during `[M1]`, not just an assumption.
- **Layout shift:** Safari's address bar showing/hiding changes the visible viewport height; prefer `dvh` units or avoid full-`100vh` reliance for anything that must not jump.

**Sources:**
- [Apple Design System Breakdown — Superdesign](https://superdesign.dev/blog/apple-design-system)

---

## [X4] Comparable open-source games

- **[ScoreUp](https://github.com/japjotsingh18/ScoreUp)** — React + Supabase + Postgres RLS, real-time multiplayer party game. Most directly relevant hit: its core principle is *"the browser is a command requester and renderer, never a game authority"* — Postgres functions/triggers own scoring and state transitions, clients only request and render. This is exactly the approach already taken in this codebase (RLS + `SECURITY DEFINER` triggers deciding reveal/forfeit outcomes rather than trusting the client). Worth borrowing: it sends lightweight realtime **invalidation hints** rather than full state payloads, then has clients re-fetch an authorized snapshot — more robust against a dropped realtime message than trusting the payload contents, which is closer to what this build already does (re-fetching on any change notification) than pushing full rows.
- **[Guessync](https://github.com/yep-yogesh/Guessync)** and **[tuneteasers](https://github.com/BahnMiFPS/tuneteasers)** — music-guessing party games (React + realtime backends). Useful for mobile song-box / round-flow layout reference; neither solves cross-device synced audio the way this spec needs, so [X1]/[X2] above still stand as the real answer for that part.

---

## Open decisions — informational only (per the doc, not implementing these)

**Self-voting and ties (current live behavior):**
Self-voting is currently **allowed** — a player can vote for their own submission (`VoteScreen.jsx` doesn't restrict vote targets). A tie (vote counts equal, including the case where both players vote for themselves) awards **no point** for the round (`RoundScore.jsx` / the round-outcome effect in `App.jsx`). This was a deliberate default made earlier: with only 2 voters, disallowing self-votes would make every round a guaranteed 1-1 tie with zero signal, since each player's only legal vote would be for the opponent.

**Featured-artist matching (current live behavior) — confirmed bug:**
The artist-lock check (`artistMatches()` in `src/lib/itunes.js`) compares the locked artist against the iTunes Search API's `artistName` field, which reflects only the **primary/lead** artist of a track. A collaboration like "Freaky Friday" by Lil Dicky ft. Chris Brown returns `artistName: "Lil Dicky"` — so a player locked to **Chris Brown** submitting that track for the "Best feature" prompt would be wrongly flagged as "not Chris Brown" and blocked from submitting, even though the prompt exists specifically for this case. Confirmed as a real, reproducible bug in the current logic; not fixed yet since it's listed under "Open decisions."
