// Finalized 21-prompt pool — see "Round prompts" in song-wars-build-spec.md.
// Each game draws 10 (no repeats) so the mix stays fresh across sessions.
export const PROMPTS = [
  // Emotional/vibe-based
  'Best love song',
  'Best sad/heartbreak song',
  'Best hype/gets-you-pumped song',
  'Best chill/relax song',
  'Best song to cry to',
  'Best angry/rage song',
  'Best feel-good song',
  // Situational
  'Best song to drive to',
  'Best song for a party',
  'Best song for a workout',
  'Best song to end the night on',
  'Best song for a road trip',
  'Best summer song',
  'Best song to get freaky to 😈',
  // Craft/performance-based
  'Best feature (a song where the artist is a guest, not the lead)',
  'Best opening track',
  'Best hook/chorus',
  'Best lyrics/storytelling',
  'Most underrated song (deep cut)',
  'Best collab',
  // Nostalgia/legacy
  'Best throwback',
  "Best song from their breakout era",
  'Song that best represents the artist overall',
]

// Fisher-Yates shuffle, then take the first `count`.
export function drawPrompts(count = 10) {
  const pool = [...PROMPTS]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, count)
}
