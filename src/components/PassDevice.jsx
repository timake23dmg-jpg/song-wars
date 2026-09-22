// Single-device stand-in for the server-side "hidden until reveal" logic described
// in the spec's Multiplayer section. Whoever isn't up looks away; the app doesn't
// render the other player's in-progress picks/votes until this gate is passed.
export default function PassDevice({ toPlayerLabel, subtitle, onReady, buttonLabel = 'Ready' }) {
  return (
    <div className="screen pass-device">
      <h2>Pass the device to</h2>
      <h1>{toPlayerLabel}</h1>
      {subtitle && <p className="subtitle">{subtitle}</p>}
      <p className="hint">Everyone else, look away 👀</p>
      <button className="btn btn-primary" onClick={onReady}>
        {buttonLabel}
      </button>
    </div>
  )
}
