import { useEffect, useRef, useState } from 'react'
import SongBox from './SongBox'
import { startReveal, requestSkip, startReplay, finishReplay } from '../lib/game'

const DEFAULT_CLIP_MS = 20_000 // default between the spec's 15-30s range; flag to change
const DEFAULT_COUNTDOWN_MS = 3_000
const DEFAULT_PAUSE_MS = 5_000
const DEFAULT_REPLAY_WINDOW_MS = 5_000 // [P3] shortened from the spec's 10s per live playtest feedback
const DEFAULT_TRANSITION_MS = 2_000

// Lightning Round's faster timings — flag to change, these are pragmatic
// defaults rather than spec'd numbers, same as the base timings above.
const LIGHTNING_CLIP_MS = 12_000
const LIGHTNING_COUNTDOWN_MS = 2_000
const LIGHTNING_PAUSE_MS = 2_500
const LIGHTNING_REPLAY_WINDOW_MS = 3_000
const LIGHTNING_TRANSITION_MS = 1_000

// [P1]-[P4]: drives the whole "coin flip already decided -> 3s countdown ->
// each song auto-plays in sequence (a 5s 'Up next' pause between each pair)
// -> one replay per song -> vote transition" sequence, synced across every
// device off one shared `reveal_started_at` timestamp plus shared
// skip/replay signals on the `games` row. Generalized in v3 to however many
// songs are actually in play (orderedSubmissions.length), not a hardcoded
// pair. See [X1]/[X2] in RESEARCH-PHASE1.md for why it's built this way: a
// single persistent <audio> element (primed during the Submit tap so iOS
// Safari allows later scripted playback) and shared timestamps that every
// client independently schedules local timers against, rather than trying
// to drive playback from a server push.
export default function RoundReveal({ game, code, orderedSubmissions, audioRef, hidePlayer, onDone }) {
  const lightning = game.mode === 'lightning_round'
  const CLIP_MS = lightning ? LIGHTNING_CLIP_MS : DEFAULT_CLIP_MS
  const COUNTDOWN_MS = lightning ? LIGHTNING_COUNTDOWN_MS : DEFAULT_COUNTDOWN_MS
  const PAUSE_MS = lightning ? LIGHTNING_PAUSE_MS : DEFAULT_PAUSE_MS
  const REPLAY_WINDOW_MS = lightning ? LIGHTNING_REPLAY_WINDOW_MS : DEFAULT_REPLAY_WINDOW_MS
  const TRANSITION_MS = lightning ? LIGHTNING_TRANSITION_MS : DEFAULT_TRANSITION_MS

  const [stage, setStage] = useState('loading')
  const [countdownLeft, setCountdownLeft] = useState(Math.ceil(COUNTDOWN_MS / 1000))
  const [replayLeft, setReplayLeft] = useState(Math.ceil(REPLAY_WINDOW_MS / 1000))
  const [nowPlayingIdx, setNowPlayingIdx] = useState(null)
  const [nextUpIdx, setNextUpIdx] = useState(null)

  const roundIndex = game.round_index
  const songCount = orderedSubmissions.length
  const replayedSlots = game.replayed_slots || []
  // When the currently-playing clip started, so the skip effect can tell
  // whether a skip signal is for THIS clip or a stale one from before.
  const stageStartRef = useRef(0)
  // The natural (un-skipped) end of whatever's playing right now, so it can
  // be cancelled if a skip ends it early — otherwise both would fire and
  // double-advance the stage.
  const pendingEndRef = useRef(null)

  function clearPendingEnd() {
    if (pendingEndRef.current) {
      clearTimeout(pendingEndRef.current.timeoutId)
      pendingEndRef.current = null
    }
  }

  // Plays one clip on the shared audio element and calls onEnd exactly once,
  // whether it ends naturally, the clip finishes early, or it's skipped.
  function playClip(track, idx, onEnd) {
    setNowPlayingIdx(idx)
    stageStartRef.current = Date.now()
    const el = audioRef.current

    let fired = false
    function end() {
      if (fired) return
      fired = true
      clearPendingEnd()
      if (el) el.onended = null
      el?.pause()
      onEnd()
    }

    if (el) {
      el.onended = end
      el.src = track.previewUrl
      el.currentTime = 0
      el.play().catch(() => {})
    }
    const timeoutId = setTimeout(end, CLIP_MS)
    pendingEndRef.current = { end, timeoutId }
  }

  // Kick off the shared clock as soon as this screen mounts (harmless no-op
  // if another device already set it for this round).
  useEffect(() => {
    startReveal(code, roundIndex).catch(console.error)
  }, [code, roundIndex])

  // Countdown -> song 0 -> pause -> song 1 -> pause -> ... -> replay window.
  useEffect(() => {
    if (songCount === 0) return
    const revealAt = game.reveal_started_at ? new Date(game.reveal_started_at).getTime() : null
    if (!revealAt) {
      setStage('loading')
      return
    }

    let cancelled = false
    const timeouts = []
    const schedule = (ms, fn) => {
      const id = setTimeout(() => {
        if (!cancelled) fn()
      }, Math.max(0, ms))
      timeouts.push(id)
      return id
    }

    function playSongAt(idx) {
      setStage('playing')
      playClip(orderedSubmissions[idx].track, idx, () => {
        if (cancelled) return
        if (idx < songCount - 1) {
          setNextUpIdx(idx + 1)
          setStage('pause')
          schedule(PAUSE_MS, () => playSongAt(idx + 1))
        } else {
          setNowPlayingIdx(null)
          setStage('replay')
        }
      })
    }

    setStage('countdown')
    const song0At = revealAt + COUNTDOWN_MS
    const countdownInterval = setInterval(() => {
      if (cancelled) return
      setCountdownLeft(Math.max(0, Math.ceil((song0At - Date.now()) / 1000)))
    }, 200)

    schedule(song0At - Date.now(), () => {
      clearInterval(countdownInterval)
      playSongAt(0)
    })

    return () => {
      cancelled = true
      clearInterval(countdownInterval)
      timeouts.forEach(clearTimeout)
      clearPendingEnd()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.reveal_started_at, roundIndex, songCount])

  // React to a shared Skip tap while a clip is actively playing (any song,
  // or a replay — playClip is used for all of them).
  useEffect(() => {
    if (!game.skip_requested_at || !pendingEndRef.current) return
    const skippedAt = new Date(game.skip_requested_at).getTime()
    if (skippedAt > stageStartRef.current) {
      pendingEndRef.current.end()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.skip_requested_at])

  // Replay window: 5s to tap any unused box; resets after each replay.
  useEffect(() => {
    if (stage !== 'replay') return
    if (replayedSlots.length >= songCount) {
      setStage('transition')
      return
    }
    if (game.replay_active_song != null) return // a replay is actively playing — handled below

    let cancelled = false
    const windowStart = Date.now()
    const interval = setInterval(() => {
      if (cancelled) return
      setReplayLeft(Math.max(0, Math.ceil((REPLAY_WINDOW_MS - (Date.now() - windowStart)) / 1000)))
    }, 200)
    const timeout = setTimeout(() => {
      if (!cancelled) setStage('transition')
    }, REPLAY_WINDOW_MS)

    return () => {
      cancelled = true
      clearInterval(interval)
      clearTimeout(timeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, replayedSlots.length, songCount, game.replay_active_song])

  // A replay was triggered (by any device) — play it here too.
  useEffect(() => {
    if (stage !== 'replay' || game.replay_active_song == null) return
    const idx = game.replay_active_song
    playClip(orderedSubmissions[idx].track, idx, () => {
      setNowPlayingIdx(null)
      finishReplay(code, roundIndex, idx).catch(console.error)
    })
    return clearPendingEnd
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.replay_active_song])

  // Vote transition -> hand off to voting.
  useEffect(() => {
    if (stage !== 'transition') return
    const id = setTimeout(onDone, TRANSITION_MS)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage])

  function skip() {
    requestSkip(code, roundIndex).catch(console.error)
  }

  function tapReplay(idx) {
    if (replayedSlots.includes(idx) || game.replay_active_song != null) return
    startReplay(code, roundIndex, idx).catch(console.error)
  }

  if (songCount === 0 || stage === 'loading') {
    return (
      <div className="screen">
        <p className="hint">Starting playback…</p>
      </div>
    )
  }

  if (stage === 'countdown') {
    return (
      <div className="screen reveal-countdown">
        <h2>🪙 Coin flip decided the order</h2>
        <p className="countdown-number">{countdownLeft > 0 ? countdownLeft : 'Go!'}</p>
      </div>
    )
  }

  if (stage === 'pause' && nextUpIdx != null) {
    return (
      <div className="screen">
        <p className="eyebrow">Up next</p>
        <div className="song-box-row song-box-row-single">
          <SongBox
            track={orderedSubmissions[nextUpIdx].track}
            playerName={orderedSubmissions[nextUpIdx].player}
            hidePlayer={hidePlayer}
          />
        </div>
      </div>
    )
  }

  if (stage === 'transition') {
    return (
      <div className="screen">
        <h2>Vote for the best song</h2>
      </div>
    )
  }

  // playing / replay
  const replayWaiting = stage === 'replay' && game.replay_active_song == null
  return (
    <div className="screen reveal">
      {replayWaiting && <p className="eyebrow">Tap a song to replay it once · {replayLeft}s</p>}
      <div className="song-box-grid">
        {orderedSubmissions.map((s, idx) => {
          const used = replayedSlots.includes(idx)
          const isReplayable = replayWaiting && !used
          return (
            <SongBox
              key={idx}
              track={s.track}
              playerName={s.player}
              hidePlayer={hidePlayer}
              playing={nowPlayingIdx === idx}
              badge={nowPlayingIdx === idx ? 'Now playing' : used ? 'Replayed' : isReplayable ? 'Tap to replay' : null}
              onClick={isReplayable ? () => tapReplay(idx) : undefined}
              disabled={stage === 'replay' && (used || (game.replay_active_song != null && nowPlayingIdx !== idx))}
            />
          )
        })}
      </div>
      {nowPlayingIdx !== null && (
        <button className="btn" onClick={skip}>
          ⏭ Skip song
        </button>
      )}
    </div>
  )
}
