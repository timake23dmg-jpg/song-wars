import { supabase, ensureSignedIn } from './supabase'
import { generateRoomCode } from './roomCode'
import { uuidv4 } from './uuid'

// Note: player inserts deliberately skip .select() (no RETURNING). The
// players SELECT policy checks the room via a function that queries
// `players` itself, and Postgres/PostgREST won't see a row just inserted by
// the same statement when re-checking that policy for RETURNING — it comes
// back as a false RLS-violation error even though the insert succeeded. We
// already know every field, so build the local object instead of asking for
// it back.
function buildPlayer({ id, gameCode, slot, name, userId }) {
  return { id, game_code: gameCode, slot, name, user_id: userId, genre: null, artist: null }
}

export async function hostGame(name) {
  const user = await ensureSignedIn()

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode()
    const { error: gameError } = await supabase.from('games').insert({ code })
    if (gameError) {
      if (gameError.code === '23505') continue // room code collision, try another
      throw gameError
    }

    const id = uuidv4()
    const { error: playerError } = await supabase
      .from('players')
      .insert({ id, game_code: code, slot: 0, name, user_id: user.id })
    if (playerError) throw playerError

    return { code, player: buildPlayer({ id, gameCode: code, slot: 0, name, userId: user.id }) }
  }

  throw new Error('Could not generate a free room code — try again.')
}

export async function joinGame(rawCode, name) {
  const user = await ensureSignedIn()
  const code = rawCode.trim().toUpperCase()

  const { data: game, error: gameError } = await supabase
    .from('games')
    .select()
    .eq('code', code)
    .maybeSingle()
  if (gameError) throw gameError
  if (!game) throw new Error('Room not found — check the code and try again.')

  const id = uuidv4()
  const { error: playerError } = await supabase
    .from('players')
    .insert({ id, game_code: code, slot: 1, name, user_id: user.id })
  if (playerError) {
    if (playerError.message?.includes('already full')) {
      throw new Error('That room is already full.')
    }
    if (playerError.code === '23505') {
      throw new Error('You already joined this room from another tab.')
    }
    throw playerError
  }

  return { code, player: buildPlayer({ id, gameCode: code, slot: 1, name, userId: user.id }) }
}

export async function fetchPlayers(code) {
  const { data, error } = await supabase.from('players').select().eq('game_code', code).order('slot')
  if (error) throw error
  return data
}

export async function fetchGame(code) {
  const { data, error } = await supabase.from('games').select().eq('code', code).maybeSingle()
  if (error) throw error
  return data
}

// Fires cb on any players/games row change for this room. Returns an unsubscribe fn.
export function subscribeToRoom(code, { onPlayers, onGame, onSubmissions, onVotes }) {
  const channel = supabase
    .channel(`room:${code}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'players', filter: `game_code=eq.${code}` },
      (payload) => onPlayers?.(payload)
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'games', filter: `code=eq.${code}` },
      (payload) => onGame?.(payload)
    )

  if (onSubmissions) {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'submissions', filter: `game_code=eq.${code}` },
      (payload) => onSubmissions(payload)
    )
  }
  if (onVotes) {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'votes', filter: `game_code=eq.${code}` },
      (payload) => onVotes(payload)
    )
  }

  channel.subscribe()
  return () => supabase.removeChannel(channel)
}
