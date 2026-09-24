// Verifies the Phase 4/5 (Best of 5 + Double or Nothing) database functions
// against the live Supabase project.
//
// Run with:  node --env-file=.env.local scripts/smoke-test-phase4-5.mjs
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

const code = 'D' + Math.random().toString(36).slice(2, 5).toUpperCase()

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
    .update({ status: 'playing', prompts: ['x'], round_index: 4, round_started_at: new Date().toISOString() })
    .eq('code', code)

  // offerDoubleOrNothing: guarded, first write wins
  const { error: offerErr } = await p1
    .from('games')
    .update({ bonus_offer_status: 'pending', bonus_offer_started_at: new Date().toISOString(), loser_player_id: player2.id })
    .eq('code', code)
    .eq('round_index', 4)
    .is('bonus_offer_status', null)
  must('offerDoubleOrNothing: first offer succeeds', !offerErr)

  const { data: raceOffer } = await p2
    .from('games')
    .update({ bonus_offer_status: 'pending', loser_player_id: player1.id })
    .eq('code', code)
    .eq('round_index', 4)
    .is('bonus_offer_status', null)
    .select()
  must('offerDoubleOrNothing: racing second offer is a no-op', (raceOffer?.length || 0) === 0)

  // acceptDoubleOrNothing (loser only, guarded from 'pending')
  const { error: acceptErr } = await p2
    .from('games')
    .update({ bonus_offer_status: 'accepted' })
    .eq('code', code)
    .eq('bonus_offer_status', 'pending')
  must('acceptDoubleOrNothing succeeds', !acceptErr)

  // startBonusMatch: guarded from match_type='main'
  const { data: bonusStart, error: bonusErr } = await p2
    .from('games')
    .update({
      match_type: 'bonus',
      match_start_round_index: 5,
      round_index: 5,
      round_started_at: new Date().toISOString(),
    })
    .eq('code', code)
    .eq('match_type', 'main')
    .select()
    .single()
  must('startBonusMatch succeeds and flips match_type', !bonusErr && bonusStart.match_type === 'bonus')

  const { data: bonusRace } = await p1
    .from('games')
    .update({ match_start_round_index: 99 })
    .eq('code', code)
    .eq('match_type', 'main')
    .select()
  must('startBonusMatch: racing second start is a no-op', (bonusRace?.length || 0) === 0)

  // endGame with double_win
  const { data: finished, error: endErr } = await p1
    .from('games')
    .update({ status: 'finished', double_win: true })
    .eq('code', code)
    .neq('status', 'finished')
    .select()
    .single()
  must('endGame succeeds with double_win', !endErr && finished.status === 'finished' && finished.double_win === true)

  console.log(`\nDone. Test room code "${code}" left in the database.`)
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exitCode = 1
})
