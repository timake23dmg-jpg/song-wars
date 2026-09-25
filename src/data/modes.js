// v3 mode/difficulty catalog for the lobby selector. `available: false`
// entries are previewed in the UI (locked, "Coming soon") but can't
// actually be picked yet — only Points League / Hard are implemented so far.
export const MODES = [
  {
    id: 'points_league',
    name: 'Points League',
    description: 'Everyone submits & votes each round; most points after a fixed number of rounds wins.',
    minPlayers: 2,
    available: true,
  },
  {
    id: 'elimination',
    name: 'Elimination',
    description: 'Lowest-voted player is cut each round, down to a winner.',
    minPlayers: 3,
    available: true,
  },
  {
    id: 'theme_night',
    name: 'Theme Night',
    description: 'One theme locks the whole match’s genre/artist pool.',
    minPlayers: 2,
    available: true,
  },
  {
    id: 'blind_mode',
    name: 'Blind Mode',
    description: 'Submissions stay anonymous through playback and voting.',
    minPlayers: 2,
    available: false,
  },
  {
    id: 'lightning_round',
    name: 'Lightning Round',
    description: 'Shorter timers, one song per matchup, quicker votes.',
    minPlayers: 2,
    available: false,
  },
]

export const DIFFICULTIES = [
  {
    id: 'hard',
    name: 'Hard',
    description: 'Spin for genre, then spin for artist — both random.',
    available: true,
  },
  {
    id: 'medium',
    name: 'Medium',
    description: 'Pick your genre, then spin for a random artist within it.',
    available: false,
  },
  {
    id: 'easy',
    name: 'Easy',
    description: 'Pick both genre and artist directly — no spinning.',
    available: false,
  },
]

export function modeById(id) {
  return MODES.find((m) => m.id === id) || MODES[0]
}
export function difficultyById(id) {
  return DIFFICULTIES.find((d) => d.id === id) || DIFFICULTIES[0]
}
