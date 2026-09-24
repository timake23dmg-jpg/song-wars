import { useRef, useState } from 'react'
import FitText from './FitText'

const WHEEL_SIZE = 260
const RADIUS = WHEEL_SIZE / 2

// Lightweight CSS conic-gradient spin wheel. Stands in for the CrazyTim/spin-wheel
// library named in the spec's tech stack — swap it in later without changing the
// call site (onResult(option)).
//
// title/subtitle render above the wheel ("Spin for Genre" / "Spin for Artist",
// with the picked genre as a subtitle on the artist wheel). resultLabel is the
// top line of the 2s result pop-up shown once the wheel stops ("Your genre" /
// "Your artist") — see [W2]/[W4] in the upgrade spec.
export default function Wheel({ options, onResult, title, subtitle, resultLabel }) {
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [popup, setPopup] = useState(null)
  const rotationRef = useRef(0)

  const n = options.length
  const segAngle = 360 / n
  // Wider slices (fewer options) get a wider label box, up to a safe cap so
  // long names never reach the wheel's outer edge.
  const labelBoxWidth = Math.max(60, Math.min(RADIUS - 12, (segAngle / 30) * 95))

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
    setPopup(null)

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
      const result = options[idx]
      setPopup(result)
      // Auto-advance ~2s after showing the result, per [W4].
      setTimeout(() => {
        setPopup(null)
        onResult(result)
      }, 2000)
    }, 4200)
  }

  return (
    <div className="wheel-wrap">
      {title && <h2 className="wheel-title">{title}</h2>}
      {subtitle && <p className="wheel-subtitle">{subtitle}</p>}

      <div className="wheel-pointer" aria-hidden="true" />
      <div
        className="wheel"
        style={{
          width: WHEEL_SIZE,
          height: WHEEL_SIZE,
          background: `conic-gradient(${gradient})`,
          transform: `rotate(${rotation}deg)`,
        }}
      >
        {options.map((opt, i) => {
          const angle = i * segAngle + segAngle / 2
          const text = typeof opt === 'string' ? opt : opt.name
          const flip = angle > 90 && angle < 270
          return (
            <div
              key={text}
              className="wheel-label"
              style={{ width: labelBoxWidth, transform: `rotate(${angle}deg)` }}
            >
              <div className="wheel-label-inner" style={flip ? { transform: 'rotate(180deg)' } : undefined}>
                <FitText
                  text={text}
                  maxWidth={labelBoxWidth - 24}
                  className="wheel-label-text"
                  style={{ transformOrigin: 'left center' }}
                />
              </div>
            </div>
          )
        })}
      </div>

      <button className="btn btn-primary" onClick={spin} disabled={spinning}>
        {spinning ? 'Spinning…' : 'Spin'}
      </button>

      {popup && (
        <div className="wheel-popup-backdrop">
          <div className="wheel-popup">
            <p className="wheel-popup-label">{resultLabel}</p>
            <FitText
              text={typeof popup === 'string' ? popup : popup.name}
              maxWidth={230}
              className="wheel-popup-value"
            />
          </div>
        </div>
      )}
    </div>
  )
}
