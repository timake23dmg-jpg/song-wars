import { supabase, ensureSignedIn } from './supabase'
import { generateRoomCode } from './roomCode'

export async function hostGame(name) {
  const user = await ensureSignedIn()

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode()
    const { error: gameError } = await supabase.from('games').insert({ code })
    if (gameError) {
      if (gameError.code === '23505') continue // room code collision, try another
      throw gameError
    }

    const { data: player, error: playerError } = await supabase
      .from('players')
      .insert({ game_code: code, slot: 0, name, user_id: user.id })
      .select()
      .single()
    if (playerError) throw playerError

    return { code, player }
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

  const { data: player, error: playerError } = await supabase
    .from('players')
    .insert({ game_code: code, slot: 1, name, user_id: user.id })
    .select()
    .single()
  if (playerError) {
    if (playerError.message?.includes('already full')) {
      throw new Error('That room is already full.')
    }
    if (playerError.code === '23505') {
      throw new Error('You already joined this room from another tab.')
    }
    throw playerError
  }

  return { code, player }
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
