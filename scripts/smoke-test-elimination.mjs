// Verifies Elimination mode's database mechanics against the live Supabase
// project: the eliminate_player RPC, and the tiebreak_player_ids flow for a
// tie at the bottom of a round.
//
// Run with:  node --env-file=.env.local scripts/smoke-test-elimination.mjs
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

const code = 'E' + Math.random().toString(36).slice(2, 5).toUpperCase()

async function main() {
  const host = client()
  const { data: hostSession } = await host.auth.signInAnonymously()
  await host.from('games').insert({ code, mode: 'elimination' })
  const hostPlayer = { id: crypto.randomUUID(), game_code: code, slot: 0, name: 'Alice', user_id: hostSession.user.id }
  await host.from('players').insert(hostPlayer)

  const joiners = []
  for (const name of ['Bob', 'Carol', 'Dan']) {
    const c = client()
    await c.auth.signInAnonymously()
    const { data: row } = await c.rpc('join_game', { p_code: code, p_name: name })
    joiners.push({ client: c, row })
  }
  const all = [{ client: host, row: hostPlayer }, ...joiners]
  must('4 players joined', joiners.every((j) => j.row))

  await host.from('games').update({ status: 'playing', prompts: ['x'], round_index: 0 }).eq('code', code)

  // eliminate_player RPC directly.
  const { error: elimErr } = await joiners[0].client.rpc('eliminate_player', { p_game_code: code, p_player_id: all[3].row.id })
  must('eliminate_player RPC succeeds (any member can call it)', !elimErr)

  const { data: afterElim } = await host.from('players').select().eq('game_code', code).order('slot')
  const dan = afterElim.find((p) => p.id === all[3].row.id)
  must('eliminated player has eliminated_at set', !!dan.eliminated_at)
  must('other players remain un-eliminated', afterElim.filter((p) => !p.eliminated_at).length === 3)

  const { error: reElimErr } = await host.rpc('eliminate_player', { p_game_code: code, p_player_id: all[3].row.id })
  const { data: stillDan } = await host.from('players').select('eliminated_at').eq('id', all[3].row.id).maybeSingle()
  must(
    'eliminating an already-eliminated player is a harmless no-op (no error, timestamp unchanged)',
    !reElimErr && stillDan.eliminated_at === dan.eliminated_at
  )

  // Tiebreak round: two of the remaining three tie for last place.
  const { error: tiebreakErr } = await host
    .from('games')
    .update({ round_index: 1, tiebreak_player_ids: [all[1].row.id, all[2].row.id], round_started_at: new Date().toISOString() })
    .eq('code', code)
    .eq('round_index', 0)
  must('advance into a tiebreak round scoped to the tied players', !tiebreakErr)

  const { data: tiebreakGame } = await host.from('games').select('tiebreak_player_ids').eq('code', code).maybeSingle()
  must(
    'tiebreak_player_ids holds exactly the two tied players',
    JSON.stringify([...tiebreakGame.tiebreak_player_ids].sort()) === JSON.stringify([all[1].row.id, all[2].row.id].sort())
  )

  // Tiebreak resolves: Carol is eliminated, clearing tiebreak scope for the next round.
  await host.rpc('eliminate_player', { p_game_code: code, p_player_id: all[2].row.id })
  const { error: clearErr } = await host
    .from('games')
    .update({ round_index: 2, tiebreak_player_ids: [], round_started_at: new Date().toISOString() })
    .eq('code', code)
    .eq('round_index', 1)
  must('tiebreak clears back to a normal round after resolving', !clearErr)

  const { data: finalPlayers } = await host.from('players').select().eq('game_code', code)
  const activeNames = finalPlayers.filter((p) => !p.eliminated_at).map((p) => p.name).sort()
  must('down to 2 active players (Alice, Bob) after both eliminations', JSON.stringify(activeNames) === JSON.stringify(['Alice', 'Bob']))

  console.log(`\nDone. Test room code "${code}" left in the database.`)
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exitCode = 1
})
