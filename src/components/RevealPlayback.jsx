import { useEffect, useRef, useState } from 'react'

const CLIP_SECONDS = 20 // default between the spec's 15–30s range; flag to change

// Coin flip decides play order, then each clip plays as a 15–30s clip (here: a
// fixed CLIP_SECONDS cutoff) before the other is revealed. `order` is computed
// deterministically by the caller (see roundPlayOrder in lib/game.js) so both
// devices show the same "coin flip" result instead of each picking randomly.
export default function RevealPlayback({ submissions, order, onDone }) {
  const [stage, setStage] = useState(0) // 0 = first song, 1 = second song, 2 = done
  const [played, setPlayed] = useState(false)
  const audioRef = useRef(null)
  const stopTimerRef = useRef(null)

  const current = submissions[order[stage]]

  useEffect(() => {
    setPlayed(false)
    return () => clearTimeout(stopTimerRef.current)
  }, [stage])

  function play() {
    const el = audioRef.current
    if (!el) return
    el.currentTime = 0
    el.play()
    clearTimeout(stopTimerRef.current)
    stopTimerRef.current = setTimeout(() => {
      el.pause()
      setPlayed(true)
    }, CLIP_SECONDS * 1000)
  }

  function onEnded() {
    clearTimeout(stopTimerRef.current)
    setPlayed(true)
  }

  function next() {
    if (stage < submissions.length - 1) {
      setStage(stage + 1)
    } else {
      onDone()
    }
  }

  return (
    <div className="screen reveal">
      <h2>🪙 Coin flip decided the order</h2>
      <p className="eyebrow">
        Now playing {stage + 1} of {submissions.length}
      </p>

      <div className="reveal-card">
        {current.track.artwork && <img src={current.track.artwork} alt="" />}
        <div>
          <strong>{current.track.title}</strong>
          <span>{current.track.artist}</span>
          <span className="hint">submitted by {current.player}</span>
        </div>
      </div>

      <audio ref={audioRef} src={current.track.previewUrl} onEnded={onEnded} />

      <div className="reveal-actions">
        <button className="btn btn-primary" onClick={play}>
          ▶ Play clip ({CLIP_SECONDS}s)
        </button>
        <button className="btn" onClick={next} disabled={!played}>
          {stage < submissions.length - 1 ? 'Next song' : 'Continue to vote'}
        </button>
      </div>
    </div>
  )
}
