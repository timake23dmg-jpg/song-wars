export default function EndScreen({ winnerName, doubleWin, scores, history, onRestart }) {
  const entries = Object.entries(scores)

  return (
    <div className="screen end-screen">
      <h1>Game over</h1>
      <h2>
        {winnerName ? `${winnerName} wins! 🏆` : "It's a tie!"}
        {doubleWin && <span className="badge badge-warn" style={{ marginLeft: 8 }}>Double Win</span>}
      </h2>

      <div className="scoreboard">
        {entries.map(([name, pts]) => (
          <div key={name} className="score-pill">
            <span>{name}</span>
            <strong>{pts}</strong>
          </div>
        ))}
      </div>

      <h3>Best of the night</h3>
      <ol className="recap-list">
        {history.map((r, i) => (
          <li key={i}>
            <span className="hint">
              {r.matchType === 'bonus' ? 'Double or Nothing — ' : ''}
              {r.prompt}
            </span>
            {r.winningTrack ? (
              <div className="recap-row">
                {r.winningTrack.artwork && <img src={r.winningTrack.artwork} alt="" />}
                <div>
                  <strong>{r.winningTrack.title}</strong>
                  <span> — {r.winningTrack.artist}</span>
                  <span className="hint"> ({r.winner})</span>
                </div>
              </div>
            ) : (
              <div className="recap-row">
                <em>Tie — no winner this round</em>
              </div>
            )}
          </li>
        ))}
      </ol>

      <button className="btn btn-primary" onClick={onRestart}>
        Play again
      </button>
    </div>
  )
}
