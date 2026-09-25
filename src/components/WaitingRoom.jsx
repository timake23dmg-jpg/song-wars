import { MODES, DIFFICULTIES } from '../data/modes'
import { THEMES } from '../data/themes'

export default function WaitingRoom({ code, players, isHost, game, onSetMode, onSetDifficulty, onSetTheme, onStart, starting }) {
  const playerCount = players.length
  const selectedMode = MODES.find((m) => m.id === game?.mode) || MODES[0]
  const isThemeNight = selectedMode.id === 'theme_night'
  const eligible = selectedMode.available && playerCount >= selectedMode.minPlayers && (!isThemeNight || !!game?.theme)

  return (
    <div className="screen">
      <p className="eyebrow">Room code</p>
      <p className="room-code">{code}</p>
      <p className="hint">Share this code with friends to join — start whenever you're ready.</p>

      <div className="player-list">
        {players.map((p) => (
          <div key={p.id} className="player-row">
            <span>{p.name}</span>
            {p.slot === 0 && <span className="badge">HOST</span>}
          </div>
        ))}
      </div>

      <div className="lobby-section">
        <p className="eyebrow">Mode</p>
        <div className="mode-grid">
          {MODES.map((m) => {
            const meetsHeadcount = playerCount >= m.minPlayers
            const locked = !m.available || !meetsHeadcount
            const selected = game?.mode === m.id
            return (
              <button
                key={m.id}
                className={`mode-tile ${selected ? 'mode-tile-selected' : ''}`}
                onClick={() => isHost && !locked && onSetMode(m.id)}
                disabled={!isHost || locked}
              >
                <strong>{m.name}</strong>
                <span className="hint">
                  {!m.available
                    ? 'Coming soon'
                    : !meetsHeadcount
                    ? `Needs ${m.minPlayers}+, you have ${playerCount}`
                    : m.description}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {isThemeNight && (
        <div className="lobby-section">
          <p className="eyebrow">Theme</p>
          <div className="mode-grid">
            {THEMES.map((t) => {
              const selected = game?.theme === t.id
              return (
                <button
                  key={t.id}
                  className={`mode-tile ${selected ? 'mode-tile-selected' : ''}`}
                  onClick={() => isHost && onSetTheme(t.id)}
                  disabled={!isHost}
                >
                  <strong>{t.name}</strong>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="lobby-section">
        <p className="eyebrow">Difficulty</p>
        <div className="mode-grid">
          {DIFFICULTIES.map((d) => {
            const selected = game?.difficulty === d.id
            return (
              <button
                key={d.id}
                className={`mode-tile ${selected ? 'mode-tile-selected' : ''}`}
                onClick={() => isHost && d.available && onSetDifficulty(d.id)}
                disabled={!isHost || !d.available}
              >
                <strong>{d.name}</strong>
                <span className="hint">{d.available ? d.description : 'Coming soon'}</span>
              </button>
            )
          })}
        </div>
      </div>

      {isHost ? (
        <button className="btn btn-primary" onClick={onStart} disabled={!eligible || starting}>
          {starting
            ? 'Starting…'
            : eligible
            ? 'Start game'
            : isThemeNight && !game?.theme
            ? 'Pick a theme to start'
            : `Waiting for ${selectedMode.minPlayers}+ players`}
        </button>
      ) : (
        <p className="hint">Waiting for the host to start…</p>
      )}
    </div>
  )
}
