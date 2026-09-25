// v3 Theme Night. Two kinds of theme:
// - 'genre': restricts the genre wheel to a curated bundle of existing
//   genres (artist pool within them is untouched).
// - 'era': restricts the genre wheel to genres that have at least one
//   artist from that decade, and the artist wheel within each to just
//   those artists — see src/lib/theme.js.
export const THEMES = [
  { id: 'pop_kpop', name: 'Pop Night', kind: 'genre', genres: ['Pop', 'K-Pop'] },
  { id: 'hiphop_rnb', name: 'Hip-Hop & R&B Night', kind: 'genre', genres: ['Hip-Hop/Rap', 'R&B'] },
  { id: 'latin_dancehall', name: 'Latin & Dancehall Night', kind: 'genre', genres: ['Latin/Reggaeton', 'Dancehall/Reggae'] },
  { id: 'rock_alt', name: 'Rock & Alternative Night', kind: 'genre', genres: ['Rock', 'Alternative/Indie'] },
  { id: 'era_1970s', name: "70s Night", kind: 'era', era: '1970s' },
  { id: 'era_1990s', name: "90s Night", kind: 'era', era: '1990s' },
  { id: 'era_2000s', name: '2000s Night', kind: 'era', era: '2000s' },
  { id: 'era_2010s', name: '2010s Night', kind: 'era', era: '2010s' },
  { id: 'era_2020s', name: '2020s Night', kind: 'era', era: '2020s' },
]

export function themeById(id) {
  return THEMES.find((t) => t.id === id) || null
}
