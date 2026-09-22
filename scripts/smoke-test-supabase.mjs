// Verifies the live Supabase schema/RLS actually behaves the way the game
// needs: two players can join a room, a 3rd is rejected, and a submission
// stays hidden from the opponent until both have submitted.
//
// Run with:  node --env-file=.env.local scripts/smoke-test-supabase.mjs
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

const code = 'T' + Math.random().toString(36).slice(2, 5).toUpperCase()

async function main() {
  const p1 = client()
  const p2 = client()

  const { data: s1, error: e1 } = await p1.auth.signInAnonymously()
  must('player 1 anonymous sign-in', !e1 && !!s1.user)
  const { data: s2, error: e2 } = await p2.auth.signInAnonymously()
  must('player 2 anonymous sign-in', !e2 && !!s2.user)

  const { error: gameErr } = await p1.from('games').insert({ code })
  must('host creates game row', !gameErr)
  if (gameErr) console.log(gameErr)

  const player1 = { id: crypto.randomUUID(), game_code: code, slot: 0, name: 'Alice', user_id: s1.user.id }
  const { error: player1Err } = await p1.from('players').insert(player1)
  must('host inserts own player row (slot 0)', !player1Err)
  if (player1Err) console.log(player1Err)

  const player2 = { id: crypto.randomUUID(), game_code: code, slot: 1, name: 'Bob', user_id: s2.user.id }
  const { error: player2Err } = await p2.from('players').insert(player2)
  must('joiner inserts own player row (slot 1)', !player2Err)
  if (player2Err) console.log(player2Err)

  const { error: thirdErr } = await p1.from('players').insert({
    id: crypto.randomUUID(),
    game_code: code,
    slot: 0,
    name: 'Carl',
    user_id: s1.user.id,
  })
  must('a 3rd player is rejected (room full trigger)', !!thirdErr)

  const { data: p2SeesP1, error: seeErr } = await p2.from('players').select().eq('game_code', code)
  must('joiner can see both players in the room', !seeErr && p2SeesP1?.length === 2)

  const track = { id: 1, title: 'Test Song', artist: 'Test Artist', previewUrl: 'x' }

  const { error: subErr } = await p1
    .from('submissions')
    .insert({ game_code: code, round_index: 0, player_id: player1.id, track })
  must('player 1 submits round 0', !subErr)
  if (subErr) console.log(subErr)

  const { data: p2SeesSubsBefore } = await p2
    .from('submissions')
    .select()
    .eq('game_code', code)
    .eq('round_index', 0)
  must("opponent cannot see player 1's pick before both submit (RLS hides it)", (p2SeesSubsBefore?.length || 0) === 0)

  const { error: sub2Err } = await p2
    .from('submissions')
    .insert({ game_code: code, round_index: 0, player_id: player2.id, track: { ...track, title: 'Bob Song' } })
  must('player 2 submits round 0', !sub2Err)
  if (sub2Err) console.log(sub2Err)

  const { data: p2SeesSubsAfter } = await p2
    .from('submissions')
    .select()
    .eq('game_code', code)
    .eq('round_index', 0)
  must('both submissions visible to both players once both are in (trigger revealed both)', (p2SeesSubsAfter?.length || 0) === 2)

  console.log(`\nDone. Test room code "${code}" was left in the database (no delete policy defined — harmless test data).`)
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exitCode = 1
})
