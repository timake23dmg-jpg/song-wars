// v3: Elimination ("Last DJ Standing"). Everyone active submits & votes
// each round; whoever gets the fewest votes is eliminated. A tie for fewest
// triggers a sudden-death mini-round scoped to just the tied players,
// repeating on further ties, until exactly one player is eliminated.

// Which players are actually competing in the *current* round: everyone
// active, unless a tiebreak is in progress (scoped to just the tied group).
export function roundParticipants(game, players) {
  if (game.mode !== 'elimination') return players
  if (game.tiebreak_player_ids && game.tiebreak_player_ids.length > 0) {
    const ids = new Set(game.tiebreak_player_ids)
    return players.filter((p) => ids.has(p.id))
  }
  return players.filter((p) => !p.eliminated_at)
}

// Vote tally keyed by player_id, same shape useRoundState already builds
// internally for the round-outcome effect.
export function tallyVotes(votes) {
  const tally = {}
  votes.forEach((v) => {
    if (v.voted_for_player_id) tally[v.voted_for_player_id] = (tally[v.voted_for_player_id] || 0) + 1
  })
  return tally
}

// Player id(s) with the fewest votes among this round's participants —
// more than one means a tie, which the caller routes into a tiebreak round
// instead of eliminating anyone yet. A participant who got zero votes
// (nobody voted for them) is included at count 0, same as if they'd been
// explicitly tallied.
export function lowestScorers(tally, participantIds) {
  const counts = participantIds.map((id) => [id, tally[id] || 0])
  if (counts.length === 0) return []
  const min = Math.min(...counts.map(([, c]) => c))
  return counts.filter(([, c]) => c === min).map(([id]) => id)
}

// The winner's name once only one active player remains, else null.
export function checkEliminationOutcome(players) {
  const active = players.filter((p) => !p.eliminated_at)
  if (active.length === 1) return active[0].name
  return null
}
