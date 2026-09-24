export default function WaitingRoom({ code, players, isHost, onStart, starting }) {
  const full = players.length >= 2

  return (
    <div className="screen">
      <p className="eyebrow">Room code</p>
      <p className="room-code">{code}</p>
      <p className="hint">Share this code with your friend to join.</p>

      <div className="scoreboard">
        {players.map((p) => (
          <div key={p.id} className="score-pill">
            <span>{p.name}</span>
            <strong>✓</strong>
          </div>
        ))}
        {!full && (
          <div className="score-pill">
            <span>Waiting…</span>
            <strong>…</strong>
          </div>
        )}
      </div>

      {isHost ? (
        <button className="btn btn-primary" onClick={onStart} disabled={!full || starting}>
          {starting ? 'Starting…' : full ? 'Start game' : 'Waiting for a second player'}
        </button>
      ) : (
        <p className="hint">{full ? "Waiting for the host to start…" : 'Waiting for the room to fill up…'}</p>
      )}
    </div>
  )
}
