// v3: Points League is the one universal scoring format, for any headcount
// from 2 up. Every round, all players submit & vote; the round's winner
// (most votes) earns a point; after a fixed number of rounds, whoever has
// the most points wins (a tie at the top is a shared/joint win, not a
// tiebreaker round — see the "still open" note in upgrade-v3/SONG-WARS-V3.md).
export const DEFAULT_ROUNDS = 7

// Running point tally, one entry per player, keyed by name (matches how
// history entries already record winners — see useRoundState.js).
export function pointsTally(history, players) {
  const points = {}
  for (const p of players) points[p.name] = 0
  for (const h of history) {
    if (h.winner) points[h.winner] = (points[h.winner] || 0) + 1
  }
  return points
}

// null while the match is still in progress (fewer rounds played than
// totalRounds); once decided, returns the point tally plus whichever
// player(s) have the highest total — more than one name means a tie at the
// top, which is a shared win, not something that triggers another round.
export function checkPointsLeagueOutcome(history, totalRounds, players) {
  if (history.length < totalRounds || players.length === 0) return null

  const points = pointsTally(history, players)
  const max = Math.max(...Object.values(points))
  const winners = Object.keys(points).filter((name) => points[name] === max)

  return { points, winners, isTie: winners.length > 1 }
}
