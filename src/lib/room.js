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

// v3: party-size lobbies — any number of players, so the joining slot can't
// just be a hardcoded 1 anymore. It's computed via a SECURITY DEFINER RPC
// (join_game, see supabase/schema.sql) rather than client-side, because the
// players SELECT policy only allows seeing players in a game you're
// ALREADY in — a plain client read-then-insert can't see existing players
// to compute its own next slot before it has a row yet. The RPC also
// re-checks "already joined" and the max-players ceiling itself, so it's
// safe to retry on conflict without re-deriving any of that client-side.
export async function joinGame(rawCode, name) {
  await ensureSignedIn()
  const code = rawCode.trim().toUpperCase()

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: player, error } = await supabase.rpc('join_game', { p_code: code, p_name: name })
    if (!error) {
      return { code, player }
    }

    if (error.message?.includes('Room not found')) {
      throw new Error('Room not found — check the code and try again.')
    }
    if (error.message?.includes('already joined')) {
      throw new Error('You already joined this room from another tab.')
    }
    if (error.message?.includes('already full')) {
      throw new Error('That room is already full.')
    }
    if (error.code === '23505') {
      continue // another joiner took this slot at the same moment — retry
    }
    throw error
  }

  throw new Error('Could not join the room — please try again.')
}

export async function fetchPlayers(code) {
  const { data, error } = await supabase.from('players').select().eq('game_code', code).order('slot')
  if (error) throw error
  return data
}

// v3: host-picked lobby settings, synced to every joiner via the games row
// they're already subscribed to.
export async function updateGameSettings(code, { mode, difficulty }) {
  const patch = {}
  if (mode !== undefined) patch.mode = mode
  if (difficulty !== undefined) patch.difficulty = difficulty
  if (Object.keys(patch).length === 0) return
  const { error } = await supabase.from('games').update(patch).eq('code', code)
  if (error) throw error
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
