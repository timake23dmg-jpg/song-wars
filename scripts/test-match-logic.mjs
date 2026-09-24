// Pure-logic test for src/lib/match.js — no Supabase/browser needed.
// Run with: node scripts/test-match-logic.mjs
import { checkMatchOutcome, roundLabel, matchRoundNumber } from '../src/lib/match.js'

const players = [{ name: 'Alice', slot: 0 }, { name: 'Bob', slot: 1 }]

function must(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${label}`)
  if (!cond) process.exitCode = 1
}

function rounds(winners) {
  return winners.map((w, i) => ({ roundIndex: i, matchType: 'main', winner: w, winningTrack: w ? {} : null }))
}

// 3-0: should decide immediately after round 3, not wait for round 5
must(
  '3-0 decides after round 3',
  checkMatchOutcome(rounds(['Alice', 'Alice', 'Alice']), 'main', players) === 'Alice'
)

// 3-1 after 4 rounds
must(
  '3-1 decides after round 4',
  checkMatchOutcome(rounds(['Alice', 'Bob', 'Alice', 'Alice']), 'main', players) === 'Alice'
)

// Undecided after 5 (2-2, one draw) -> not yet decided, goes to sudden death
must(
  '2-2 with a draw after 5 rounds is undecided',
  checkMatchOutcome(rounds(['Alice', 'Bob', 'Alice', 'Bob', null]), 'main', players) === null
)

// Sudden death round 6 drawn -> still undecided
must(
  'drawn sudden death round stays undecided',
  checkMatchOutcome(rounds(['Alice', 'Bob', 'Alice', 'Bob', null, null]), 'main', players) === null
)

// Sudden death round 7 decides it
must(
  'sudden death round with a winner decides the match',
  checkMatchOutcome(rounds(['Alice', 'Bob', 'Alice', 'Bob', null, null, 'Bob']), 'main', players) === 'Bob'
)

// Bonus match: best of 3, 2-0 decides after round 2
must(
  'bonus 2-0 decides after round 2',
  checkMatchOutcome(
    [
      { roundIndex: 0, matchType: 'bonus', winner: 'Bob' },
      { roundIndex: 1, matchType: 'bonus', winner: 'Bob' },
    ],
    'bonus',
    players
  ) === 'Bob'
)

// Round labels
must('label: main round 1', roundLabel('main', 1) === 'Round 1')
must('label: main round 5', roundLabel('main', 5) === 'Round 5')
must('label: main sudden death', roundLabel('main', 6) === 'Sudden Death')
must('label: bonus round 1', roundLabel('bonus', 1) === 'Double or Nothing: Round 1')
must('label: bonus sudden death', roundLabel('bonus', 4) === 'Double or Nothing: Sudden Death')

// matchRoundNumber
must(
  'matchRoundNumber: main round 1 (index 0, start 0)',
  matchRoundNumber({ round_index: 0, match_start_round_index: 0 }) === 1
)
must(
  'matchRoundNumber: bonus round 1 (index 6, start 6)',
  matchRoundNumber({ round_index: 6, match_start_round_index: 6 }) === 1
)
must(
  'matchRoundNumber: bonus round 2 (index 7, start 6)',
  matchRoundNumber({ round_index: 7, match_start_round_index: 6 }) === 2
)
