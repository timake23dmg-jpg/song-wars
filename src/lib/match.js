// [R1] Best of 5 (main match) / best of 3 (Double or Nothing bonus match),
// with sudden-death rounds played one at a time past the cap until someone
// wins a round outright (a draw doesn't end it, just continues).
export const MAIN_ROUNDS = 5
export const MAIN_WINS_NEEDED = 3
export const BONUS_ROUNDS = 3
export const BONUS_WINS_NEEDED = 2

export function roundsCapFor(matchType) {
  return matchType === 'bonus' ? BONUS_ROUNDS : MAIN_ROUNDS
}
export function winsNeededFor(matchType) {
  return matchType === 'bonus' ? BONUS_WINS_NEEDED : MAIN_WINS_NEEDED
}

// [S1] "Round 1" / "Sudden Death" / "Double or Nothing: Round 1" / "Double
// or Nothing: Sudden Death".
export function roundLabel(matchType, roundNumber) {
  const cap = roundsCapFor(matchType)
  const prefix = matchType === 'bonus' ? 'Double or Nothing: ' : ''
  return roundNumber > cap ? `${prefix}Sudden Death` : `${prefix}Round ${roundNumber}`
}

// 1-based round number within the current match (resets when the bonus
// match starts, unlike the game's global round_index which keeps counting
// up so the shared prompt pool never repeats a prompt across both matches).
export function matchRoundNumber(game) {
  return game.round_index - game.match_start_round_index + 1
}

// Returns the winning player's name once the match is decided, else null
// (still in progress — either short of the rounds cap, or a drawn sudden
// death round that must continue).
export function checkMatchOutcome(matchHistory, matchType, players) {
  const winsNeeded = winsNeededFor(matchType)
  const cap = roundsCapFor(matchType)

  const wins = {}
  for (const h of matchHistory) {
    if (h.winner) wins[h.winner] = (wins[h.winner] || 0) + 1
  }
  for (const p of players) {
    if ((wins[p.name] || 0) >= winsNeeded) return p.name
  }

  if (matchHistory.length > cap) {
    const last = matchHistory[matchHistory.length - 1]
    if (last.winner) return last.winner
  }
  return null
}
