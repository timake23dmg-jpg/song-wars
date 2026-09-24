import { useState } from 'react'
import Timer from './Timer'

// [S2] Shown when the main match just ended. Only the loser decides — the
// winner just waits. If the loser doesn't answer within 15s, the game ends
// normally (same as tapping End Game).
export default function DoubleOrNothingOffer({ isLoser, finalScoreText, onAccept, onDecline }) {
  const [decided, setDecided] = useState(false)

  function accept() {
    if (decided) return
    setDecided(true)
    onAccept()
  }
  function decline() {
    if (decided) return
    setDecided(true)
    onDecline()
  }

  if (!isLoser) {
    return (
      <div className="screen">
        <h2>{finalScoreText}</h2>
        <p className="hint">Waiting for your opponent to decide on Double or Nothing…</p>
      </div>
    )
  }

  return (
    <div className="screen">
      <h2>{finalScoreText}</h2>
      <p>Want to go Double or Nothing?</p>
      <Timer seconds={15} running={!decided} onExpire={decline} />
      <button className="btn btn-primary" onClick={accept} disabled={decided}>
        Double or Nothing
      </button>
      <button className="btn" onClick={decline} disabled={decided}>
        End Game
      </button>
    </div>
  )
}
