import { useEffect } from 'react'

// [S1] Full-screen announcement shown for ~3s before every round, both main
// and bonus. Purely local/per-device timing — nothing here needs the two
// devices to be frame-perfect in sync, just to both eventually land on the
// same round.
export default function RoundAnnounce({ label, scores, onDone }) {
  useEffect(() => {
    const id = setTimeout(onDone, 3000)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label])

  return (
    <div className="screen round-announce">
      <h1>{label}</h1>
      <div className="scoreboard">
        {Object.entries(scores).map(([name, pts]) => (
          <div key={name} className="score-pill">
            <span>{name}</span>
            <strong>{pts}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}
