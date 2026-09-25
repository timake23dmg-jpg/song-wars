import { GENRES } from '../data/genres.js'
import { ARTIST_ERAS } from '../data/artistEras.js'

// Returns the genre pool a Theme Night match should spin from: unfiltered
// GENRES when there's no theme, a curated subset of genres for a 'genre'
// theme (artist pool within each untouched), or — for an 'era' theme — only
// the genres that have at least one matching artist, each with its own
// artist list filtered down to just that era. A genre with zero matches for
// the chosen era is dropped entirely rather than left with an empty (and
// unspinnable) artist wheel.
export function themedGenres(theme) {
  if (!theme) return GENRES

  if (theme.kind === 'genre') {
    return GENRES.filter((g) => theme.genres.includes(g.name))
  }

  if (theme.kind === 'era') {
    return GENRES.map((g) => ({ ...g, artists: g.artists.filter((a) => ARTIST_ERAS[a] === theme.era) })).filter(
      (g) => g.artists.length > 0
    )
  }

  return GENRES
}
