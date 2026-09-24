// Verifies v3 party-size lobby behavior against the live Supabase project:
// dynamic slot assignment beyond 2 players, and the generalized "everyone
// in the room has submitted/voted" reveal triggers (previously hardcoded
// to exactly 2).
//
// Run with:  node --env-file=.env.local scripts/smoke-test-party-lobby.mjs
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Run with --env-file=.env.local')
  process.exit(1)
}
function client() {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
function must(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${label}`)
  if (!cond) process.exitCode = 1
}

const code = 'L' + Math.random().toString(36).slice(2, 5).toUpperCase()
const NAMES = ['Alice', 'Bob', 'Carol']

async function makePlayer(name, isHost) {
  const c = client()
  const { data: session } = await c.auth.signInAnonymously()
  return { client: c, userId: session.user.id, name, isHost }
}

async function main() {
  const players = await Promise.all(NAMES.map((n, i) => makePlayer(n, i === 0)))
  const [host, ...joiners] = players

  await host.client.from('games').insert({ code })

  // Host takes slot 0.
  const hostRow = { id: crypto.randomUUID(), game_code: code, slot: 0, name: host.name, user_id: host.userId }
  const { error: hostErr } = await host.client.from('players').insert(hostRow)
  must('host takes slot 0', !hostErr)

  // Joiners take sequential slots via the join_game RPC — the same path
  // lib/room.js's joinGame uses, chosen specifically because a plain client
  // read-then-insert can't see existing players (RLS only allows seeing
  // players in a game you're already in) to compute its own next slot.
  const playerRows = [hostRow]
  for (const joiner of joiners) {
    const { data: row, error } = await joiner.client.rpc('join_game', { p_code: code, p_name: joiner.name })
    must(`${joiner.name} joins via RPC and gets a slot`, !error && row)
    if (error) console.log(error)
    if (row) playerRows.push(row)
  }
  must(
    'joiners got sequential slots 1, 2',
    playerRows.length === 3 && playerRows[1].slot === 1 && playerRows[2].slot === 2
  )

  const { data: allPlayers } = await host.client.from('players').select().eq('game_code', code).order('slot')
  must('all 3 players visible with slots 0,1,2', JSON.stringify((allPlayers || []).map((p) => p.slot)) === '[0,1,2]')

  await host.client
    .from('games')
    .update({ status: 'playing', prompts: ['x'], round_index: 0, round_started_at: new Date().toISOString(), mode: 'points_league' })
    .eq('code', code)

  // Two of three submit — should NOT reveal yet (old hardcoded-2 logic would
  // have revealed here, which is exactly the bug this migration fixes).
  const track = { id: 1, title: 'Test Song', artist: 'Test Artist', previewUrl: 'x' }
  await players[0].client.from('submissions').insert({ game_code: code, round_index: 0, player_id: playerRows[0].id, track })
  await players[1].client.from('submissions').insert({ game_code: code, round_index: 0, player_id: playerRows[1].id, track })

  const { data: subsAfterTwo } = await players[2].client
    .from('submissions')
    .select()
    .eq('game_code', code)
    .eq('round_index', 0)
  must('2 of 3 submitted: 3rd player sees nothing yet (not revealed)', (subsAfterTwo?.length || 0) === 0)

  // Third player submits — now all 3 are in, should reveal to everyone.
  await players[2].client.from('submissions').insert({ game_code: code, round_index: 0, player_id: playerRows[2].id, track })

  const { data: subsAfterThree } = await players[0].client
    .from('submissions')
    .select()
    .eq('game_code', code)
    .eq('round_index', 0)
  must('3 of 3 submitted: all 3 submissions now visible to everyone', (subsAfterThree?.length || 0) === 3)

  console.log(`\nDone. Test room code "${code}" left in the database.`)
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exitCode = 1
})
