// Verifies the new start_match / advance_round / start_reveal RPCs (which
// stamp round_started_at / reveal_started_at from the database's own clock
// instead of the calling client's) and the mode-aware reveal_expired_round
// window, against the live Supabase project.
//
// Run with:  node --env-file=.env.local scripts/smoke-test-server-time.mjs
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Run with --env-file=.env.local')
  process.exit(1)
}
function must(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${label}`)
  if (!cond) process.exitCode = 1
}

async function newSession() {
  const c = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  await c.auth.signInAnonymously()
  return c
}

async function main() {
  const host = await newSession()
  const code = 'S' + Math.random().toString(36).slice(2, 5).toUpperCase()

  await host.from('games').insert({ code, status: 'wheel', mode: 'lightning_round' })
  const { data: hostSession } = await host.auth.getSession()
  await host.from('players').insert({ id: crypto.randomUUID(), game_code: code, slot: 0, name: 'Host', user_id: hostSession.session.user.id })

  // start_match: flips wheel -> playing and stamps round_started_at from the DB's clock.
  const beforeCall = Date.now()
  const { error: startErr } = await host.rpc('start_match', { p_game_code: code })
  must('start_match succeeds', !startErr)
  if (startErr) console.log(startErr)

  const { data: afterStart } = await host.from('games').select('status, round_started_at').eq('code', code).maybeSingle()
  const startedAtMs = afterStart?.round_started_at ? new Date(afterStart.round_started_at).getTime() : null
  must('status flips to playing', afterStart?.status === 'playing')
  must(
    'round_started_at is a real server timestamp near now()',
    startedAtMs !== null && Math.abs(startedAtMs - beforeCall) < 15_000
  )

  // Racing a second start_match (status no longer 'wheel') is a harmless no-op.
  const { error: raceErr } = await host.rpc('start_match', { p_game_code: code })
  const { data: afterRace } = await host.from('games').select('round_started_at').eq('code', code).maybeSingle()
  must(
    'racing start_match after the fact is a no-op (timestamp unchanged)',
    !raceErr && afterRace?.round_started_at === afterStart?.round_started_at
  )

  // advance_round: bumps round_index, restamps round_started_at, applies tiebreak_player_ids.
  const { error: advErr } = await host.rpc('advance_round', { p_game_code: code, p_from_round_index: 0 })
  must('advance_round succeeds', !advErr)
  const { data: afterAdvance } = await host.from('games').select('round_index, tiebreak_player_ids').eq('code', code).maybeSingle()
  must('advance_round bumps round_index to 1', afterAdvance?.round_index === 1)
  must('advance_round defaults tiebreak_player_ids to empty', (afterAdvance?.tiebreak_player_ids || []).length === 0)

  // start_reveal: guarded, stamps reveal_started_at from the DB's clock.
  const { error: revErr } = await host.rpc('start_reveal', { p_game_code: code, p_round_index: 1 })
  must('start_reveal succeeds', !revErr)
  const { data: afterReveal } = await host.from('games').select('reveal_started_at').eq('code', code).maybeSingle()
  must('reveal_started_at is set', !!afterReveal?.reveal_started_at)

  const { error: revRaceErr } = await host.rpc('start_reveal', { p_game_code: code, p_round_index: 1 })
  const { data: afterRevealRace } = await host.from('games').select('reveal_started_at').eq('code', code).maybeSingle()
  must(
    'racing start_reveal is a no-op (timestamp unchanged)',
    !revRaceErr && afterRevealRace?.reveal_started_at === afterReveal?.reveal_started_at
  )

  // reveal_expired_round: mode-aware window. This game is lightning_round
  // (25s), and round_started_at was just set (0s elapsed) — the window check
  // must run without error and simply no-op this early (nothing to assert on
  // submissions since none were made — this just confirms the RPC itself,
  // including its mode lookup, doesn't blow up).
  const { error: expireNoopErr } = await host.rpc('reveal_expired_round', { p_game_code: code, p_round_index: 1 })
  must('reveal_expired_round does not error on a fresh round', !expireNoopErr)

  console.log(`\nDone. Test room code "${code}" left in the database.`)
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exitCode = 1
})
