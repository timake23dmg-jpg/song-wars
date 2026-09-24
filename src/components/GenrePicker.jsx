// [W3] Double or Nothing only: the loser picks a genre instead of spinning
// for one. Tappable tiles, then continues into the normal Spin for Artist wheel.
export default function GenrePicker({ genres, onPick }) {
  return (
    <div className="screen">
      <h2>Pick Your Genre</h2>
      <p className="hint">Double or Nothing: choose the genre you'll draw your artist from.</p>
      <div className="genre-grid">
        {genres.map((g) => (
          <button key={g.name} className="genre-tile" onClick={() => onPick(g)}>
            {g.name}
          </button>
        ))}
      </div>
    </div>
  )
}
