// Pure-logic test for src/lib/pointsLeague.js — no Supabase/browser needed.
// Run with: node scripts/test-points-league.mjs
import { checkPointsLeagueOutcome, pointsTally } from '../src/lib/pointsLeague.js'

function must(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${label}`)
  if (!cond) process.exitCode = 1
}

function rounds(winners) {
  return winners.map((w, i) => ({ roundIndex: i, winner: w }))
}

// 4-player game, 5 rounds, no tie.
const players4 = [{ name: 'Alice' }, { name: 'Bob' }, { name: 'Carol' }, { name: 'Dan' }]
must(
  'undecided before totalRounds is reached',
  checkPointsLeagueOutcome(rounds(['Alice', 'Bob', 'Alice', null]), 5, players4) === null
)

const decided = checkPointsLeagueOutcome(rounds(['Alice', 'Bob', 'Alice', null, 'Alice']), 5, players4)
must('decided once totalRounds is reached', decided !== null)
must('correct point tally', decided.points.Alice === 3 && decided.points.Bob === 1 && decided.points.Carol === 0)
must('single winner, not a tie', decided.winners.length === 1 && decided.winners[0] === 'Alice' && !decided.isTie)

// Tie at the top: two players share the max.
const tied = checkPointsLeagueOutcome(rounds(['Alice', 'Bob', 'Alice', 'Bob', null]), 5, players4)
must('tie at the top is a shared win, not null', tied !== null && tied.isTie)
must('both tied players listed', tied.winners.includes('Alice') && tied.winners.includes('Bob') && tied.winners.length === 2)

// 2-player game still works the same way (Points League replaces Best of 5
// for every headcount, including 2).
const players2 = [{ name: 'Ben' }, { name: 'Jess' }]
const twoPlayer = checkPointsLeagueOutcome(rounds(['Ben', 'Ben', 'Jess', 'Ben', null, null, 'Ben']), 7, players2)
must('2-player Points League decides correctly', twoPlayer.winners.length === 1 && twoPlayer.winners[0] === 'Ben')

// pointsTally alone, mid-match (fewer rounds than totalRounds).
const midMatch = pointsTally(rounds(['Alice', 'Bob']), players4)
must('pointsTally works mid-match without needing totalRounds', midMatch.Alice === 1 && midMatch.Carol === 0)
