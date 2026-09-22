import { useEffect, useRef, useState } from 'react'

// Server-authoritative in the real (Phase 2) build; here it's just a local
// countdown since Phase 1 runs on a single device.
export default function Timer({ seconds, onExpire, running = true }) {
  const [remaining, setRemaining] = useState(seconds)
  const expiredRef = useRef(false)

  useEffect(() => {
    setRemaining(seconds)
    expiredRef.current = false
  }, [seconds])

  useEffect(() => {
    if (!running) return
    if (remaining <= 0) {
      if (!expiredRef.current) {
        expiredRef.current = true
        onExpire()
      }
      return
    }
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000)
    return () => clearTimeout(t)
  }, [remaining, running, onExpire])

  const low = remaining <= 10
  return (
    <div className={`timer ${low ? 'timer-low' : ''}`}>
      {remaining}s
    </div>
  )
}
