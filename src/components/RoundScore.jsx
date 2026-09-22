export default function RoundScore({ result, scores, roundNumber, totalRounds, onContinue }) {
  return (
    <div className="screen round-score">
      <p className="eyebrow">
        Round {roundNumber} of {totalRounds}
      </p>
      {result.winner ? (
        <h2>
          {result.winner} wins the round with{' '}
          <em>{result.winningTrack.title}</em>!
        </h2>
      ) : (
        <h2>It's a tie — no point awarded this round</h2>
      )}

      <div className="scoreboard">
        {Object.entries(scores).map(([name, pts]) => (
          <div key={name} className="score-pill">
            <span>{name}</span>
            <strong>{pts}</strong>
          </div>
        ))}
      </div>

      <button className="btn btn-primary" onClick={onContinue}>
        {roundNumber < totalRounds ? 'Next round' : 'See final results'}
      </button>
    </div>
  )
}
