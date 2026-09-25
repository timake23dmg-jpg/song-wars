// v3: winners is an array (Points League can end in a tie at the top with
// any number of players sharing the win, not just a binary "tie or not").
export default function EndScreen({ winners, scores, history, onRestart }) {
  const entries = Object.entries(scores).sort(([, a], [, b]) => b - a)
  const isTie = winners.length > 1

  return (
    <div className="screen end-screen">
      <div className="end-card end-winner-card">
        <p className="eyebrow">Game over</p>
        <h1 className="end-winner-name">
          {winners.length === 0 ? "It's a tie!" : isTie ? `${winners.join(' & ')} tie for the win!` : `🏆 ${winners[0]} wins!`}
        </h1>

        <div className="end-score-row">
          {entries.map(([name, pts]) => (
            <div key={name} className={`end-score-card ${winners.includes(name) ? 'end-score-card-winner' : ''}`}>
              <span className="end-score-name">{name}</span>
              <strong className="end-score-value">{pts}</strong>
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
                <span className="recap-prompt">{r.prompt}</span>
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
