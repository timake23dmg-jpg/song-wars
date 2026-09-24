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

const RESET_PLAYBACK_FIELDS = {
  reveal_started_at: null,
  skip_requested_at: null,
  replay1_used: false,
  replay2_used: false,
  replay_active_at: null,
  replay_active_song: null,
}

// Advances to the next round within the current match (main or bonus) — it
// never ends the game itself; the caller decides that by checking the Best
// of 5 / sudden death outcome first (see checkMatchOutcome in App.jsx) and
// calls offerDoubleOrNothing/endGame instead when a match is decided.
// Guarded by .eq('round_index', ...) so if both clients race to advance the
// same round, only the first write takes effect — the second just matches
// zero rows and is a harmless no-op; both clients converge on the same
// state via the realtime subscription.
export async function advanceRound(gameCode, fromRoundIndex) {
  const { error } = await supabase
    .from('games')
    .update({
      round_index: fromRoundIndex + 1,
      round_started_at: new Date().toISOString(),
      ...RESET_PLAYBACK_FIELDS,
    })
    .eq('code', gameCode)
    .eq('round_index', fromRoundIndex)
  if (error) throw error
}

// [R1] Ends the game outright — either the main match was declined for
// Double or Nothing, or a bonus match just concluded. doubleWin marks the
// case where the original winner won again (the loser's gamble failed).
export async function endGame(gameCode, { doubleWin = false } = {}) {
  const { error } = await supabase
    .from('games')
    .update({ status: 'finished', double_win: doubleWin })
    .eq('code', gameCode)
    .neq('status', 'finished')
  if (error) throw error
}

// [S2] The main match just ended without a clear "loser" needing to decide
// yet — this marks the offer as pending so both devices show the right
// screen (loser gets the choice, winner waits). Guarded so only the first
// client to notice the match is decided creates the offer.
export async function offerDoubleOrNothing(gameCode, fromRoundIndex, loserPlayerId) {
  const { error } = await supabase
    .from('games')
    .update({
      bonus_offer_status: 'pending',
      bonus_offer_started_at: new Date().toISOString(),
      loser_player_id: loserPlayerId,
    })
    .eq('code', gameCode)
    .eq('round_index', fromRoundIndex)
    .is('bonus_offer_status', null)
  if (error) throw error
}

// [S2] Loser accepts — both devices move to the genre re-pick screen next.
export async function acceptDoubleOrNothing(gameCode) {
  const { error } = await supabase
    .from('games')
    .update({ bonus_offer_status: 'accepted' })
    .eq('code', gameCode)
    .eq('bonus_offer_status', 'pending')
  if (error) throw error
}

// [S2] Loser declines (or the 15s offer timer ran out) — game ends normally.
export async function declineDoubleOrNothing(gameCode) {
  const { error } = await supabase
    .from('games')
    .update({ bonus_offer_status: 'declined', status: 'finished' })
    .eq('code', gameCode)
    .eq('bonus_offer_status', 'pending')
  if (error) throw error
}

// [R2] Starts the bonus match once the loser has re-picked their artist.
// Guarded by .eq('match_type','main') so it only ever fires once.
export async function startBonusMatch(gameCode, fromRoundIndex) {
  const { error } = await supabase
    .from('games')
    .update({
      match_type: 'bonus',
      match_start_round_index: fromRoundIndex + 1,
      round_index: fromRoundIndex + 1,
      round_started_at: new Date().toISOString(),
      ...RESET_PLAYBACK_FIELDS,
    })
    .eq('code', gameCode)
    .eq('match_type', 'main')
  if (error) throw error
}

// [P1] Marks the moment both submissions are in and the reveal sequence (3s
// countdown -> song 1 -> pause -> song 2 -> replay -> vote) begins. Guarded
// so only the first client to notice sets it; the whole sequence is then
// scheduled off this one shared timestamp on both devices.
export async function startReveal(gameCode, roundIndex) {
  const { error } = await supabase
    .from('games')
    .update({ reveal_started_at: new Date().toISOString() })
    .eq('code', gameCode)
    .eq('round_index', roundIndex)
    .is('reveal_started_at', null)
  if (error) throw error
}

// [P1]/[P3] "Skip Song": ends whatever's currently playing on both devices.
// No first-write-wins guard needed — skip is idempotent (it doesn't matter
// whose request "wins," the outcome is identical), so this always just
// overwrites the timestamp. Each client decides relevance locally by
// comparing this against its current stage's own start time.
export async function requestSkip(gameCode, roundIndex) {
  const { error } = await supabase
    .from('games')
    .update({ skip_requested_at: new Date().toISOString() })
    .eq('code', gameCode)
    .eq('round_index', roundIndex)
  if (error) throw error
}

// [P3] Starts replaying one song. Guarded so that if both players tap
// different boxes at the same moment, only the first commit wins and the
// second is a no-op (matches [X2]: "first tap wins, second is ignored").
export async function startReplay(gameCode, roundIndex, songIndex) {
  const { error } = await supabase
    .from('games')
    .update({ replay_active_at: new Date().toISOString(), replay_active_song: songIndex })
    .eq('code', gameCode)
    .eq('round_index', roundIndex)
    .is('replay_active_at', null)
  if (error) throw error
}

// [P3] Marks a song's one-time replay as consumed once it finishes playing
// (naturally or via skip), locking that box for the rest of the round.
export async function finishReplay(gameCode, roundIndex, songIndex) {
  const field = songIndex === 0 ? 'replay1_used' : 'replay2_used'
  const { error } = await supabase
    .from('games')
    .update({ [field]: true, replay_active_at: null, replay_active_song: null })
    .eq('code', gameCode)
    .eq('round_index', roundIndex)
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
