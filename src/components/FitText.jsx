import { useLayoutEffect, useRef, useState } from 'react'

// Renders text on one line, shrinking it down (never wrapping, never
// overflowing) to fit whatever width the parent gives it. Used for wheel
// slice labels and the result pop-up, where names range from "BTS" to
// "Red Hot Chili Peppers" in the same fixed-size space.
export default function FitText({ text, className, style, maxWidth }) {
  const spanRef = useRef(null)
  const [scale, setScale] = useState(1)

  useLayoutEffect(() => {
    const el = spanRef.current
    if (!el || !maxWidth) return
    el.style.transform = 'scale(1)'
    const natural = el.scrollWidth
    const next = natural > maxWidth ? Math.max(0.5, maxWidth / natural) : 1
    setScale(next)
  }, [text, maxWidth])

  return (
    <span
      ref={spanRef}
      className={className}
      style={{ ...style, display: 'inline-block', whiteSpace: 'nowrap', transform: `scale(${scale})` }}
    >
      {text}
    </span>
  )
}
