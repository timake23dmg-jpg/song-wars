import { useRef } from 'react'

// One persistent <audio> element, shared by every stage of the reveal
// sequence. iOS Safari only allows scripted .play() on an element that's
// already been played during a real user gesture — see [X1] in
// upgrade/song-wars-upgrade/RESEARCH-PHASE1.md — so this gets "primed"
// during the Submit tap (a real click) rather than created fresh when the
// reveal starts (which is never a user gesture).
export function useAudioPriming() {
  const audioRef = useRef(null)

  function primeAudio() {
    const el = audioRef.current
    if (!el) return
    el.muted = true
    el.play()
      .then(() => {
        el.pause()
        el.muted = false
      })
      .catch(() => {
        el.muted = false
      })
  }

  return { audioRef, primeAudio }
}
