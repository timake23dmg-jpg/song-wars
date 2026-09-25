// Pure-logic test for src/lib/theme.js — no Supabase/browser needed.
// Run with: node scripts/test-theme.mjs
import { themedGenres } from '../src/lib/theme.js'
import { themeById } from '../src/data/themes.js'
import { GENRES } from '../src/data/genres.js'
import { ARTIST_ERAS } from '../src/data/artistEras.js'

function must(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${label}`)
  if (!cond) process.exitCode = 1
}

must('no theme returns every genre unfiltered', themedGenres(null).length === GENRES.length)

const popNight = themedGenres(themeById('pop_kpop'))
must('genre theme restricts to just its bundle', popNight.map((g) => g.name).sort().join(',') === 'K-Pop,Pop')
must(
  'genre theme leaves the artist pool within those genres untouched',
  popNight.find((g) => g.name === 'Pop').artists.length === GENRES.find((g) => g.name === 'Pop').artists.length
)

const era2020s = themedGenres(themeById('era_2020s'))
must('era theme only includes genres with at least one matching artist', era2020s.every((g) => g.artists.length > 0))
must(
  'era theme filters each genre\'s artists down to just that era',
  era2020s.every((g) => g.artists.every((a) => ARTIST_ERAS[a] === '2020s'))
)
// Several genres (Hip-Hop/Rap, Rock, Dancehall/Reggae, Electronic/Dance,
// Soul/Funk) genuinely have no 2020s-breakout artist in the current
// 5-per-genre pool — a real content gap, not a bug, so this only checks
// that 2020s Night still leaves *some* genres to spin from.
must('2020s Night still has at least one eligible genre', era2020s.length > 0 && era2020s.length < GENRES.length)

const era1970s = themedGenres(themeById('era_1970s'))
must(
  '70s Night correctly drops genres with zero matching artists (thin early-decade pool)',
  era1970s.length < GENRES.length && era1970s.length > 0
)
must(
  '70s Night only includes genuinely 70s-tagged artists',
  era1970s.every((g) => g.artists.every((a) => ARTIST_ERAS[a] === '1970s'))
)

// Every artist in the pool must have an era tag — catches a typo/omission
// in artistEras.js before it silently drops someone from every era theme.
const allArtists = GENRES.flatMap((g) => g.artists)
const untagged = allArtists.filter((a) => !ARTIST_ERAS[a])
must(`every artist in the pool has an era tag (${untagged.length} missing: ${untagged.join(', ')})`, untagged.length === 0)
