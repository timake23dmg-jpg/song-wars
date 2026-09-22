// Verifies the round-loop data layer (submissions, votes, forfeit-by-expiry,
// round advancement) against the live Supabase project, end to end, without
// needing a browser.
//
// Run with:  node --env-file=.env.local scripts/smoke-test-round-loop.mjs
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
  const p1 = client()
  const p2 = client()

  const { data: s1 } = await p1.auth.signInAnonymously()
  const { data: s2 } = await p2.auth.signInAnonymously()

  await p1.from('games').insert({ code })
  const player1 = { id: crypto.randomUUID(), game_code: code, slot: 0, name: 'Alice', user_id: s1.user.id }
  const player2 = { id: crypto.randomUUID(), game_code: code, slot: 1, name: 'Bob', user_id: s2.user.id }
  await p1.from('players').insert(player1)
  await p2.from('players').insert(player2)

  // --- wheel lock + round start ---
  await p1.from('players').update({ genre: 'Pop', artist: 'Dua Lipa' }).eq('id', player1.id)
  await p2.from('players').update({ genre: 'Rock', artist: 'Coldplay' }).eq('id', player2.id)

  const roundStartedAt = new Date().toISOString()
  const { error: goErr } = await p1
    .from('games')
    .update({ status: 'playing', prompts: ['Best love song'], round_index: 0, round_started_at: roundStartedAt })
    .eq('code', code)
  must('round 0 starts', !goErr)

  // --- round 0: both submit and vote normally ---
  const trackA = { id: 1, title: 'Levitating', artist: 'Dua Lipa', previewUrl: 'x' }
  const trackB = { id: 2, title: 'Yellow', artist: 'Coldplay', previewUrl: 'y' }

  const { error: sub1Err } = await p1.from('submissions').insert({ game_code: code, round_index: 0, player_id: player1.id, track: trackA })
  const { error: sub2Err } = await p2.from('submissions').insert({ game_code: code, round_index: 0, player_id: player2.id, track: trackB })
  must('round 0: both submissions inserted', !sub1Err && !sub2Err)

  const { data: subsSeenByP2 } = await p2.from('submissions').select().eq('game_code', code).eq('round_index', 0)
  must('round 0: both submissions visible to both players', (subsSeenByP2?.length || 0) === 2)

  const { error: vote1Err } = await p1.from('votes').insert({ game_code: code, round_index: 0, voter_player_id: player1.id, voted_for_player_id: player2.id })
  const { error: vote2Err } = await p2.from('votes').insert({ game_code: code, round_index: 0, voter_player_id: player2.id, voted_for_player_id: player2.id })
  must('round 0: both votes cast (Bob wins 2-0)', !vote1Err && !vote2Err)

  const { data: votesSeenByP1 } = await p1.from('votes').select().eq('game_code', code).eq('round_index', 0)
  must('round 0: both votes visible to both players', (votesSeenByP1?.length || 0) === 2)

  // --- advance to round 1 (guarded update) ---
  const { error: advErr } = await p1
    .from('games')
    .update({ round_index: 1, round_started_at: new Date(Date.now() - 65_000).toISOString() }) // pretend it started 65s ago
    .eq('code', code)
    .eq('round_index', 0)
  must('advance to round 1', !advErr)

  // second client racing the same advance should be a harmless no-op
  const { data: raceData, error: raceErr } = await p2
    .from('games')
    .update({ round_index: 2 })
    .eq('code', code)
    .eq('round_index', 0) // stale precondition — should match nothing now
    .select()
  must('racing advance from a stale round_index affects 0 rows', !raceErr && (raceData?.length || 0) === 0)

  // --- round 1: only player 1 submits, then the timer "expires" (backdated above) ---
  const trackC = { id: 3, title: 'New Rules', artist: 'Dua Lipa', previewUrl: 'z' }
  await p1.from('submissions').insert({ game_code: code, round_index: 1, player_id: player1.id, track: trackC })

  const { data: p2SeesRound1Before } = await p2.from('submissions').select().eq('game_code', code).eq('round_index', 1)
  must("round 1: player 2 can't see player 1's pick before expiry reveal", (p2SeesRound1Before?.length || 0) === 0)

  const { error: revealErr } = await p2.rpc('reveal_expired_round', { p_game_code: code, p_round_index: 1 })
  must('round 1: reveal_expired_round RPC succeeds', !revealErr)
  if (revealErr) console.log(revealErr)

  const { data: p2SeesRound1After } = await p2.from('submissions').select().eq('game_code', code).eq('round_index', 1)
  must('round 1: forfeit reveals the lone submission to both players', (p2SeesRound1After?.length || 0) === 1)

  console.log(`\nDone. Test room code "${code}" left in the database (harmless test data, no delete policy defined).`)
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exitCode = 1
})
