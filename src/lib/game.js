import { supabase } from './supabase'

export async function submitSong(gameCode, roundIndex, playerId, track) {
  const { error } = await supabase
    .from('submissions')
    .insert({ game_code: gameCode, round_index: roundIndex, player_id: playerId, track })
  if (error) throw error
}

// votedForPlayerId = null records an explicit "no vote cast" row, which lets
// the round resolve via the normal both-rows-present reveal trigger even
// when a player's personal vote timer runs out.
export async function castVote(gameCode, roundIndex, voterPlayerId, votedForPlayerId) {
  const { error } = await supabase
    .from('votes')
    .insert({ game_code: gameCode, round_index: roundIndex, voter_player_id: voterPlayerId, voted_for_player_id: votedForPlayerId })
  if (error) throw error
}

export async function revealExpiredRound(gameCode, roundIndex) {
  const { error } = await supabase.rpc('reveal_expired_round', {
    p_game_code: gameCode,
    p_round_index: roundIndex,
  })
  if (error) console.error('revealExpiredRound failed:', error)
}

export async function fetchRoundSubmissions(gameCode, roundIndex) {
  const { data, error } = await supabase
    .from('submissions')
    .select()
    .eq('game_code', gameCode)
    .eq('round_index', roundIndex)
  if (error) throw error
  return data
}

export async function fetchRoundVotes(gameCode, roundIndex) {
  const { data, error } = await supabase
    .from('votes')
    .select()
    .eq('game_code', gameCode)
    .eq('round_index', roundIndex)
  if (error) throw error
  return data
}

// Advances to the next round (or finishes the game). Guarded by .eq('round_index', ...)
// so if both clients race to advance the same round, only the first write
// takes effect — the second just matches zero rows and is a harmless no-op;
// both clients converge on the same state via the realtime subscription.
export async function advanceRound(gameCode, fromRoundIndex, totalRounds) {
  const nextIndex = fromRoundIndex + 1
  const patch =
    nextIndex >= totalRounds
      ? { status: 'finished' }
      : { round_index: nextIndex, round_started_at: new Date().toISOString() }

  const { error } = await supabase
    .from('games')
    .update(patch)
    .eq('code', gameCode)
    .eq('round_index', fromRoundIndex)
  if (error) throw error
}

// Deterministic "coin flip" for playback order — both devices compute the
// same value from data they already share (room code + round number)
// instead of needing an extra round trip to agree on it.
export function roundPlayOrder(gameCode, roundIndex) {
  const str = `${gameCode}:${roundIndex}`
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0
  }
  return (hash & 1) === 0 ? [0, 1] : [1, 0]
}
