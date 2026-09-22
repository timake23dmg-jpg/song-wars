import { useRef, useState } from 'react'

// Lightweight CSS conic-gradient spin wheel. Stands in for the CrazyTim/spin-wheel
// library named in the spec's tech stack — swap it in later without changing the
// call site (onResult(option)).
export default function Wheel({ options, onResult, label }) {
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [settled, setSettled] = useState(null)
  const rotationRef = useRef(0)

  const n = options.length
  const segAngle = 360 / n

  const gradient = options
    .map((_, i) => {
      const hue = Math.round((i * 360) / n)
      const from = i * segAngle
      const to = (i + 1) * segAngle
      return `hsl(${hue} 70% 55%) ${from}deg ${to}deg`
    })
    .join(', ')

  function spin() {
    if (spinning) return
    setSpinning(true)
    setSettled(null)

    const idx = Math.floor(Math.random() * n)
    const targetCenter = idx * segAngle + segAngle / 2
    const extraSpins = 4 + Math.floor(Math.random() * 3) // 4-6 full turns
    const base = (360 - targetCenter) % 360
    const current = rotationRef.current
    const delta = extraSpins * 360 + ((base - (current % 360)) + 360) % 360
    const next = current + delta

    rotationRef.current = next
    setRotation(next)

    // Fallback in case transitionend doesn't fire (matches the CSS transition duration).
    setTimeout(() => {
      setSpinning(false)
      setSettled(options[idx])
      onResult(options[idx])
    }, 4200)
  }

  return (
    <div className="wheel-wrap">
      <div className="wheel-pointer" aria-hidden="true" />
      <div
        className="wheel"
        style={{
          background: `conic-gradient(${gradient})`,
          transform: `rotate(${rotation}deg)`,
        }}
      >
        {options.map((opt, i) => {
          const angle = i * segAngle + segAngle / 2
          const text = typeof opt === 'string' ? opt : opt.name
          return (
            <div
              key={text}
              className="wheel-label"
              style={{ transform: `rotate(${angle}deg)` }}
            >
              <span style={{ transform: `rotate(${180 / n}deg)` }}>{text}</span>
            </div>
          )
        })}
      </div>
      <button className="btn btn-primary" onClick={spin} disabled={spinning}>
        {spinning ? 'Spinning…' : `Spin for ${label}`}
      </button>
      {settled && !spinning && (
        <p className="wheel-result">
          Landed on <strong>{typeof settled === 'string' ? settled : settled.name}</strong>
        </p>
      )}
    </div>
  )
}
