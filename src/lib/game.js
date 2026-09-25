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
  replayed_slots: [],
  replay_active_at: null,
  replay_active_song: null,
}

// Advances to the next round. Never ends the game itself — the caller
// decides that (see checkPointsLeagueOutcome / checkEliminationOutcome) and
// calls endGame instead once the match is decided. Guarded by
// .eq('round_index', ...) so if multiple clients race to advance the same
// round, only the first write takes effect — the rest just match zero rows
// and are harmless no-ops; every client converges on the same state via the
// realtime subscription. extraPatch lets a mode layer on its own fields
// (e.g. Elimination sets/clears tiebreak_player_ids) without duplicating
// this guarded-write pattern.
export async function advanceRound(gameCode, fromRoundIndex, extraPatch = {}) {
  const { error } = await supabase
    .from('games')
    .update({
      round_index: fromRoundIndex + 1,
      round_started_at: new Date().toISOString(),
      ...RESET_PLAYBACK_FIELDS,
      ...extraPatch,
    })
    .eq('code', gameCode)
    .eq('round_index', fromRoundIndex)
  if (error) throw error
}

// Elimination mode: marks a player eliminated (idempotent — eliminating an
// already-eliminated player is a harmless no-op, so no guard is needed).
export async function eliminatePlayer(gameCode, playerId) {
  const { error } = await supabase.rpc('eliminate_player', { p_game_code: gameCode, p_player_id: playerId })
  if (error) throw error
}

// Ends the game outright. doubleWin only applies to the legacy Double or
// Nothing flow (see below) — Points League always calls this with no
// options once total_rounds is reached.
export async function endGame(gameCode, { doubleWin = false } = {}) {
  const { error } = await supabase
    .from('games')
    .update({ status: 'finished', double_win: doubleWin })
    .eq('code', gameCode)
    .neq('status', 'finished')
  if (error) throw error
}

// --- Legacy Best of 5 / Sudden Death / Double or Nothing flow ---
// Not on the active path since v3 made Points League the one universal
// format (see upgrade-v3/SONG-WARS-V3.md); kept rather than deleted in case
// this comes back as its own selectable mode later.

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
// replayed_slots is an array rather than a fixed pair of booleans since a
// round can have any number of songs (v3 party-size lobbies) — races on the
// read-modify-write here are already ruled out upstream by startReplay's
// "only one active replay at a time" guard, so a plain read-then-write is
// safe.
export async function finishReplay(gameCode, roundIndex, songIndex) {
  const { data: gameRow, error: fetchError } = await supabase
    .from('games')
    .select('replayed_slots')
    .eq('code', gameCode)
    .maybeSingle()
  if (fetchError) throw fetchError

  const updated = Array.from(new Set([...(gameRow?.replayed_slots || []), songIndex]))
  const { error } = await supabase
    .from('games')
    .update({ replayed_slots: updated, replay_active_at: null, replay_active_song: null })
    .eq('code', gameCode)
    .eq('round_index', roundIndex)
  if (error) throw error
}

// A seeded, deterministic shuffle (Park-Miller PRNG) so every device
// computes the identical "coin flip" play order for however many songs are
// in this round, from data they already share (room code + round number)
// instead of needing an extra round trip to agree on it.
function seededRandom(seed) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return function next() {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

export function roundPlayOrder(gameCode, roundIndex, count) {
  const str = `${gameCode}:${roundIndex}`
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0
  }
  const rand = seededRandom(hash || 1)

  const order = Array.from({ length: count }, (_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
}
