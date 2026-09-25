// Pure-logic test for the featured-artist fix in src/lib/itunes.js — no network.
// Run with: node scripts/test-artist-matching.mjs
import { artistMatches } from '../src/lib/itunes.js'

function must(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${label}`)
  if (!cond) process.exitCode = 1
}

// The exact bug scenario from the v3 spec.
must(
  'featured artist matches via title fallback (Lil Dicky ft. Chris Brown)',
  artistMatches('Lil Dicky', 'Chris Brown', 'Freaky Friday (feat. Chris Brown)') === true
)
must(
  'featured artist matches with "ft." credit style too',
  artistMatches('Lil Dicky', 'Chris Brown', 'Freaky Friday ft. Chris Brown') === true
)

// Existing behavior must still hold.
must('primary artist still matches directly', artistMatches('Chris Brown', 'Chris Brown', 'Loyal') === true)
must(
  'substring match still works (locked artist name contains result)',
  artistMatches('Ed Sheeran', 'Ed Sheeran', 'Shape of You') === true
)
must(
  'unrelated artist is still rejected (no match in artistName or title)',
  artistMatches('Drake', 'Chris Brown', 'Hotline Bling') === false
)
must('empty/missing fields are handled without throwing', artistMatches('', 'Chris Brown', '') === false)
must('missing title falls back to just the artistName check', artistMatches('Drake', 'Chris Brown') === false)
