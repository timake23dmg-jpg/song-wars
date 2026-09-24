// Verifies v3's N-player round loop mechanics against the live Supabase
// project: replayed_slots (array-based replay tracking, replacing the old
// fixed replay1_used/replay2_used pair) and vote tallying by player_id for
// 3 players.
//
// Run with:  node --env-file=.env.local scripts/smoke-test-v3-round-loop.mjs
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

const code = 'R' + Math.random().toString(36).slice(2, 5).toUpperCase()

async function main() {
  const host = client()
  const { data: hostSession } = await host.auth.signInAnonymously()

  await host.from('games').insert({ code })
  const hostPlayer = { id: crypto.randomUUID(), game_code: code, slot: 0, name: 'Alice', user_id: hostSession.user.id }
  await host.from('players').insert(hostPlayer)

  const joiners = []
  for (const name of ['Bob', 'Carol']) {
    const c = client()
    await c.auth.signInAnonymously()
    const { data: row } = await c.rpc('join_game', { p_code: code, p_name: name })
    joiners.push({ client: c, row })
  }
  const allPlayers = [{ client: host, row: hostPlayer }, ...joiners]
  must('3 players joined (host + 2 via RPC)', joiners.every((j) => j.row))

  await host
    .from('games')
    .update({ status: 'playing', prompts: ['x'], round_index: 0, round_started_at: new Date().toISOString(), total_rounds: 3 })
    .eq('code', code)

  // All 3 submit.
  const track = (n) => ({ id: n, title: `Song ${n}`, artist: `Artist ${n}`, previewUrl: 'x' })
  for (let i = 0; i < 3; i++) {
    await allPlayers[i].client
      .from('submissions')
      .insert({ game_code: code, round_index: 0, player_id: allPlayers[i].row.id, track: track(i) })
  }
  const { data: subs } = await host.from('submissions').select().eq('game_code', code).eq('round_index', 0)
  must('all 3 submissions revealed once all 3 are in', (subs?.length || 0) === 3)

  // --- replayed_slots array mechanics ---
  const { error: replay0Err } = await host
    .from('games')
    .update({ replay_active_at: new Date().toISOString(), replay_active_song: 0 })
    .eq('code', code)
    .is('replay_active_at', null)
  must('start replay of song 0', !replay0Err)

  // finishReplay's read-modify-write pattern (see lib/game.js) — replicate
  // it here against the live row.
  const { data: gameAfterReplay0 } = await host.from('games').select('replayed_slots').eq('code', code).maybeSingle()
  const updated0 = Array.from(new Set([...(gameAfterReplay0?.replayed_slots || []), 0]))
  await host.from('games').update({ replayed_slots: updated0, replay_active_at: null, replay_active_song: null }).eq('code', code)

  const { data: gameAfterFinish0 } = await host.from('games').select('replayed_slots').eq('code', code).maybeSingle()
  must('replayed_slots contains [0] after replaying song 0', JSON.stringify(gameAfterFinish0.replayed_slots) === '[0]')

  // Replay song 2 as well — array should accumulate, not overwrite.
  const { data: gameForSlot2 } = await host.from('games').select('replayed_slots').eq('code', code).maybeSingle()
  const updated2 = Array.from(new Set([...(gameForSlot2?.replayed_slots || []), 2]))
  await host.from('games').update({ replayed_slots: updated2 }).eq('code', code)

  const { data: gameFinal } = await host.from('games').select('replayed_slots').eq('code', code).maybeSingle()
  must(
    'replayed_slots accumulates multiple replays [0,2], not just the last one',
    JSON.stringify([...gameFinal.replayed_slots].sort()) === '[0,2]'
  )

  // --- N-player vote tally by player_id ---
  // Bob and Carol vote for Alice; Alice votes for Bob. Alice should win 2-1.
  await allPlayers[0].client.from('votes').insert({ game_code: code, round_index: 0, voter_player_id: allPlayers[0].row.id, voted_for_player_id: allPlayers[1].row.id })
  await allPlayers[1].client.from('votes').insert({ game_code: code, round_index: 0, voter_player_id: allPlayers[1].row.id, voted_for_player_id: allPlayers[0].row.id })
  await allPlayers[2].client.from('votes').insert({ game_code: code, round_index: 0, voter_player_id: allPlayers[2].row.id, voted_for_player_id: allPlayers[0].row.id })

  const { data: votes } = await host.from('votes').select().eq('game_code', code).eq('round_index', 0)
  must('all 3 votes revealed once all 3 are in', (votes?.length || 0) === 3)

  const tally = {}
  votes.forEach((v) => {
    if (v.voted_for_player_id) tally[v.voted_for_player_id] = (tally[v.voted_for_player_id] || 0) + 1
  })
  const [topId, topCount] = Object.entries(tally).sort(([, a], [, b]) => b - a)[0]
  must('Alice wins the round 2-1 by player_id tally', topId === allPlayers[0].row.id && topCount === 2)

  console.log(`\nDone. Test room code "${code}" left in the database.`)
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exitCode = 1
})
