// Verifies the Phase 3 playback-sync columns/guards against the live
// Supabase project: reveal_started_at (guarded), skip_requested_at
// (unconditional), replay start (guarded, first-tap-wins), and finishReplay.
//
// Run with:  node --env-file=.env.local scripts/smoke-test-phase3.mjs
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

const code = 'P' + Math.random().toString(36).slice(2, 5).toUpperCase()

async function main() {
  const p1 = client()
  const p2 = client()
  const { data: s1 } = await p1.auth.signInAnonymously()
  const { data: s2 } = await p2.auth.signInAnonymously()

  await p1.from('games').insert({ code })
  const player1 = { id: crypto.randomUUID(), game_code: code, slot: 0, name: 'Alice', user_id: s1.user.id }
  const player2 = { id: crypto.randomUUID(), game_code: code, slot: 1, name: 'Bob', user_id: s2.user.id }
  await p1.from('players').insert(player1)
  await p2.from('players').insert(player2)
  await p1
    .from('games')
    .update({ status: 'playing', prompts: ['Best love song'], round_index: 0, round_started_at: new Date().toISOString() })
    .eq('code', code)

  // reveal_started_at: guarded, first write wins
  const t1 = new Date().toISOString()
  const { error: r1 } = await p1.from('games').update({ reveal_started_at: t1 }).eq('code', code).is('reveal_started_at', null)
  must('reveal_started_at: first set succeeds', !r1)

  const { data: raceData } = await p2
    .from('games')
    .update({ reveal_started_at: new Date().toISOString() })
    .eq('code', code)
    .is('reveal_started_at', null)
    .select()
  must('reveal_started_at: second (racing) set is a no-op', (raceData?.length || 0) === 0)

  // skip_requested_at: unconditional overwrite
  const { error: skipErr } = await p2.from('games').update({ skip_requested_at: new Date().toISOString() }).eq('code', code)
  must('skip_requested_at: unconditional write succeeds', !skipErr)

  // replay: guarded start, first tap wins
  const { error: replayErr } = await p1
    .from('games')
    .update({ replay_active_at: new Date().toISOString(), replay_active_song: 0 })
    .eq('code', code)
    .is('replay_active_at', null)
  must('replay: first start succeeds', !replayErr)

  const { data: replayRace } = await p2
    .from('games')
    .update({ replay_active_at: new Date().toISOString(), replay_active_song: 1 })
    .eq('code', code)
    .is('replay_active_at', null)
    .select()
  must('replay: racing second start is a no-op', (replayRace?.length || 0) === 0)

  const { data: finalGame, error: finishErr } = await p1
    .from('games')
    .update({ replay1_used: true, replay_active_at: null, replay_active_song: null })
    .eq('code', code)
    .select()
    .single()
  must('replay: finishReplay clears active state', !finishErr && finalGame.replay1_used === true && finalGame.replay_active_song === null)

  console.log(`\nDone. Test room code "${code}" left in the database.`)
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exitCode = 1
})
