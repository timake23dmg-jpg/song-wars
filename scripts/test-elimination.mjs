// Pure-logic test for src/lib/elimination.js — no Supabase/browser needed.
// Run with: node scripts/test-elimination.mjs
import { roundParticipants, tallyVotes, lowestScorers, checkEliminationOutcome } from '../src/lib/elimination.js'

function must(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${label}`)
  if (!cond) process.exitCode = 1
}

const players = [
  { id: 'a', name: 'Alice', eliminated_at: null },
  { id: 'b', name: 'Bob', eliminated_at: null },
  { id: 'c', name: 'Carol', eliminated_at: '2026-01-01' }, // already out
  { id: 'd', name: 'Dan', eliminated_at: null },
]

must(
  'roundParticipants: normal round is every active player, eliminated ones excluded',
  JSON.stringify(roundParticipants({ mode: 'elimination', tiebreak_player_ids: [] }, players).map((p) => p.id)) ===
    JSON.stringify(['a', 'b', 'd'])
)

must(
  'roundParticipants: tiebreak round is scoped to just the tied ids, even if one is already eliminated elsewhere',
  JSON.stringify(roundParticipants({ mode: 'elimination', tiebreak_player_ids: ['a', 'd'] }, players).map((p) => p.id)) ===
    JSON.stringify(['a', 'd'])
)

must(
  'roundParticipants: points_league mode ignores elimination fields entirely',
  roundParticipants({ mode: 'points_league', tiebreak_player_ids: [] }, players).length === 4
)

const tally = tallyVotes([
  { voted_for_player_id: 'a' },
  { voted_for_player_id: 'a' },
  { voted_for_player_id: 'b' },
  { voted_for_player_id: null }, // missed vote, shouldn't count toward anyone
])
must('tallyVotes counts correctly and ignores null votes', tally.a === 2 && tally.b === 1 && tally.d === undefined)

must(
  'lowestScorers: a participant who got zero votes is included at 0, not skipped',
  JSON.stringify(lowestScorers(tally, ['a', 'b', 'd']).sort()) === JSON.stringify(['d'])
)

must(
  'lowestScorers: a genuine tie for fewest returns both ids',
  JSON.stringify(lowestScorers({ a: 3, b: 1, d: 1 }, ['a', 'b', 'd']).sort()) === JSON.stringify(['b', 'd'])
)

must('lowestScorers: empty participant list returns empty', lowestScorers({}, []).length === 0)

must(
  'checkEliminationOutcome: null while 2+ active players remain',
  checkEliminationOutcome(players) === null
)
must(
  'checkEliminationOutcome: returns the sole remaining active player once down to 1',
  checkEliminationOutcome([
    { id: 'a', name: 'Alice', eliminated_at: null },
    { id: 'b', name: 'Bob', eliminated_at: '2026-01-01' },
    { id: 'c', name: 'Carol', eliminated_at: '2026-01-01' },
  ]) === 'Alice'
)
