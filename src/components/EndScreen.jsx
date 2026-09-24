export default function EndScreen({ winnerName, doubleWin, scores, history, onRestart }) {
  const entries = Object.entries(scores)

  return (
    <div className="screen end-screen">
      <div className="end-card end-winner-card">
        <p className="eyebrow">Game over</p>
        <h1 className="end-winner-name">
          {winnerName ? (
            <>
              🏆 {winnerName} wins!
            </>
          ) : (
            "It's a tie!"
          )}
        </h1>
        {doubleWin && <span className="badge badge-warn end-doublewin-badge">Double Win</span>}

        <div className="end-score-row">
          {entries.map(([name, pts], i) => (
            <div key={name} className="end-score-card">
              <span className="end-score-name">{name}</span>
              <strong className="end-score-value">{pts}</strong>
              {i === 0 && entries.length > 1 && <span className="end-score-vs">vs</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="end-card">
        <h3 className="end-card-title">Best of the night</h3>
        <div className="recap-table">
          {history.map((r, i) => (
            <div className="recap-row-grid" key={i}>
              <div className="recap-cell-art">
                {r.winningTrack?.artwork ? (
                  <img src={r.winningTrack.artwork} alt="" />
                ) : (
                  <div className="recap-art-placeholder" />
                )}
              </div>
              <div className="recap-cell-info">
                <span className="recap-prompt">
                  {r.matchType === 'bonus' ? 'DoN · ' : ''}
                  {r.prompt}
                </span>
                {r.winningTrack ? (
                  <>
                    <strong className="recap-song-title">{r.winningTrack.title}</strong>
                    <span className="recap-song-artist">{r.winningTrack.artist}</span>
                  </>
                ) : (
                  <em className="recap-tie">Tie — no winner</em>
                )}
              </div>
              <div className="recap-cell-winner">{r.winner && <span className="recap-winner-badge">{r.winner}</span>}</div>
            </div>
          ))}
        </div>
      </div>

      <button className="btn btn-primary" onClick={onRestart}>
        Play again
      </button>
    </div>
  )
}
