import { useEffect, useMemo, useRef, useState } from 'react'
import { GENRES } from './data/genres'
import { drawPrompts } from './data/prompts'
import { supabase } from './lib/supabase'
import { subscribeToRoom, fetchPlayers, fetchGame } from './lib/room'
import {
  submitSong,
  castVote,
  revealExpiredRound,
  fetchRoundSubmissions,
  fetchRoundVotes,
  advanceRound,
  roundPlayOrder,
} from './lib/game'
import Wheel from './components/Wheel'
import Lobby from './components/Lobby'
import WaitingRoom from './components/WaitingRoom'
import SongSearch from './components/SongSearch'
import RoundReveal from './components/RoundReveal'
import VoteScreen from './components/VoteScreen'
import RoundScore from './components/RoundScore'
import EndScreen from './components/EndScreen'

const TOTAL_ROUNDS = 10

export default function App() {
  const [phase, setPhase] = useState('lobby')
  const [code, setCode] = useState(null)
  const [myPlayer, setMyPlayer] = useState(null)
  const [players, setPlayers] = useState([])
  const [game, setGame] = useState(null)
  const [myGenre, setMyGenre] = useState(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState(null)

  const [roundSubmissions, setRoundSubmissions] = useState([])
  const [roundVotes, setRoundVotes] = useState([])
  const [timedOut, setTimedOut] = useState(false)
  const [revealDone, setRevealDone] = useState(false)
  const [scores, setScores] = useState({})
  const [history, setHistory] = useState([])

  const gameRef = useRef(null)
  useEffect(() => {
    gameRef.current = game
  }, [game])

  // One persistent <audio> element, shared by every stage of the reveal
  // sequence. iOS Safari only allows scripted .play() on an element that's
  // already been played during a real user gesture — see [X1] in
  // RESEARCH-PHASE1.md — so this gets "primed" during the Submit tap
  // (submitSong below) rather than created fresh when the reveal starts.
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

  const opponent = players.find((p) => p.id !== myPlayer?.id) || null
  const myLatest = players.find((p) => p.id === myPlayer?.id) || myPlayer

  // Subscribe to the room once we've joined it.
  useEffect(() => {
    if (!code) return

    let cancelled = false
    ;(async () => {
      const [initialPlayers, initialGame] = await Promise.all([fetchPlayers(code), fetchGame(code)])
      if (cancelled) return
      setPlayers(initialPlayers)
      setGame(initialGame)
    })()

    const unsubscribe = subscribeToRoom(code, {
      onPlayers: () => {
        fetchPlayers(code).then(setPlayers).catch(console.error)
      },
      onGame: (payload) => {
        if (payload.new) setGame(payload.new)
      },
      onSubmissions: () => {
        const g = gameRef.current
        if (!g) return
        fetchRoundSubmissions(code, g.round_index).then(setRoundSubmissions).catch(console.error)
      },
      onVotes: () => {
        const g = gameRef.current
        if (!g) return
        fetchRoundVotes(code, g.round_index).then(setRoundVotes).catch(console.error)
      },
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [code])

  // Leave the waiting room once the host starts the game (status flips to 'wheel').
  useEffect(() => {
    if (phase === 'waiting' && players.length >= 2 && game?.status === 'wheel') {
      setPhase('wheel-genre')
    }
  }, [phase, players, game])

  function handleJoined({ code, player }) {
    setCode(code)
    setMyPlayer(player)
    setPhase('waiting')
  }

  async function startGame() {
    setStarting(true)
    setError(null)
    try {
      const prompts = drawPrompts(TOTAL_ROUNDS)
      const { error: updateError } = await supabase
        .from('games')
        .update({ status: 'wheel', prompts, round_index: 0, round_started_at: null })
        .eq('code', code)
      if (updateError) throw updateError
    } catch (err) {
      setError(err.message || 'Could not start the game.')
    } finally {
      setStarting(false)
    }
  }

  function lockGenre(genre) {
    setMyGenre(genre)
    setPhase('wheel-artist')
  }

  async function lockArtist(artist) {
    try {
      const { error: updateError } = await supabase
        .from('players')
        .update({ genre: myGenre.name, artist })
        .eq('id', myPlayer.id)
      if (updateError) throw updateError
      setPhase('wheel-waiting')
    } catch (err) {
      setError(err.message || 'Could not save your pick.')
    }
  }

  const opponentLocked = !!opponent?.artist
  const iAmLocked = !!myLatest?.artist

  // Once both players are locked in, flip the room from "wheel" to "playing"
  // and start round 0's clock. Guarded by .eq('status','wheel') so if both
  // clients race to do this, only the first write takes effect.
  useEffect(() => {
    if (phase === 'wheel-waiting' && iAmLocked && opponentLocked && game?.status === 'wheel') {
      supabase
        .from('games')
        .update({ status: 'playing', round_started_at: new Date().toISOString() })
        .eq('code', code)
        .eq('status', 'wheel')
        .then(({ error: updateError }) => {
          if (updateError) console.error(updateError)
        })
    }
  }, [phase, iAmLocked, opponentLocked, game?.status, code])

  // Follow the shared game status into (and out of) the round loop.
  useEffect(() => {
    if (game?.status === 'playing' && phase !== 'round-loop') {
      setPhase('round-loop')
    }
    if (game?.status === 'finished' && phase !== 'end') {
      setPhase('end')
    }
  }, [game?.status, phase])

  // Reset per-round local state whenever the shared round changes.
  useEffect(() => {
    if (!game || game.status !== 'playing') return
    setTimedOut(false)
    setRevealDone(false)
    fetchRoundSubmissions(code, game.round_index).then(setRoundSubmissions).catch(console.error)
    fetchRoundVotes(code, game.round_index).then(setRoundVotes).catch(console.error)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.round_index, game?.status])

  // Seed the scoreboard once, when the round loop begins.
  useEffect(() => {
    if (phase === 'round-loop' && players.length === 2 && Object.keys(scores).length === 0) {
      setScores({ [players[0].name]: 0, [players[1].name]: 0 })
    }
  }, [phase, players, scores])

  const initialSeconds = useMemo(() => {
    if (!game?.round_started_at) return 60
    const elapsed = (Date.now() - new Date(game.round_started_at).getTime()) / 1000
    return Math.max(0, Math.round(60 - elapsed))
  }, [game?.round_index, game?.round_started_at])

  const mySubmissionRow = roundSubmissions.find((s) => s.player_id === myPlayer?.id) || null
  const oppSubmissionRow = roundSubmissions.find((s) => s.player_id === opponent?.id) || null
  const iSubmitted = !!mySubmissionRow
  const bothSubmitted = iSubmitted && !!oppSubmissionRow

  const myVoteRow = roundVotes.find((v) => v.voter_player_id === myPlayer?.id) || null
  const oppVoteRow = roundVotes.find((v) => v.voter_player_id === opponent?.id) || null
  const bothVoted = !!myVoteRow && !!oppVoteRow

  const order = useMemo(() => roundPlayOrder(code, game?.round_index ?? 0), [code, game?.round_index])

  const orderedSubmissions = useMemo(() => {
    if (!bothSubmitted || players.length !== 2) return []
    const bySlot = [null, null]
    for (const p of players) {
      const row = roundSubmissions.find((s) => s.player_id === p.id)
      if (row) bySlot[p.slot] = { player: p.name, playerId: p.id, track: row.track }
    }
    if (!bySlot[0] || !bySlot[1]) return []
    return order.map((i) => bySlot[i])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bothSubmitted, players, roundSubmissions, order])

  // Record each round's outcome exactly once, whether it resolved by both
  // players voting or by the timer running out (forfeit/tie).
  useEffect(() => {
    if (phase !== 'round-loop' || !game || players.length !== 2) return
    const idx = game.round_index
    if (history.some((h) => h.roundIndex === idx)) return

    let outcome = null
    if (bothSubmitted && bothVoted) {
      const tally = [0, 0]
      const votedSlot = (row) => players.find((p) => p.id === row.voted_for_player_id)?.slot
      const s1 = votedSlot(myVoteRow)
      const s2 = votedSlot(oppVoteRow)
      if (s1 != null) tally[s1] += 1
      if (s2 != null) tally[s2] += 1

      let winnerSlot = null
      if (tally[0] > tally[1]) winnerSlot = 0
      else if (tally[1] > tally[0]) winnerSlot = 1

      if (winnerSlot !== null) {
        const winPlayer = players.find((p) => p.slot === winnerSlot)
        const winRow = roundSubmissions.find((s) => s.player_id === winPlayer.id)
        outcome = { winner: winPlayer.name, winningTrack: winRow.track }
      } else {
        outcome = { winner: null, winningTrack: null }
      }
    } else if (timedOut && !bothSubmitted) {
      if (iSubmitted && !oppSubmissionRow) {
        outcome = { winner: myLatest.name, winningTrack: mySubmissionRow.track }
      } else if (!iSubmitted && oppSubmissionRow) {
        outcome = { winner: opponent.name, winningTrack: oppSubmissionRow.track }
      } else {
        outcome = { winner: null, winningTrack: null }
      }
    } else {
      return
    }

    setHistory((prev) => [
      ...prev,
      { roundIndex: idx, prompt: game.prompts[idx], winner: outcome.winner, winningTrack: outcome.winningTrack },
    ])
    if (outcome.winner) {
      setScores((prev) => ({ ...prev, [outcome.winner]: (prev[outcome.winner] || 0) + 1 }))
    }
  }, [phase, game, players, roundSubmissions, roundVotes, timedOut, bothSubmitted, bothVoted])

  async function handleSubmitSong(track) {
    try {
      await submitSong(code, game.round_index, myPlayer.id, track)
      setRoundSubmissions((prev) =>
        prev.some((s) => s.player_id === myPlayer.id)
          ? prev
          : [...prev, { game_code: code, round_index: game.round_index, player_id: myPlayer.id, track, revealed: false }]
      )
    } catch (err) {
      setError(err.message || 'Could not submit your song.')
    }
  }

  function handleSearchExpire() {
    setTimedOut(true)
    revealExpiredRound(code, game.round_index)
  }

  async function handleVote(idx) {
    try {
      const votedForPlayerId = idx === null ? null : orderedSubmissions[idx].playerId
      await castVote(code, game.round_index, myPlayer.id, votedForPlayerId)
      setRoundVotes((prev) =>
        prev.some((v) => v.voter_player_id === myPlayer.id)
          ? prev
          : [...prev, { voter_player_id: myPlayer.id, voted_for_player_id: votedForPlayerId, revealed: false }]
      )
    } catch (err) {
      setError(err.message || 'Could not cast your vote.')
    }
  }

  async function handleContinueRound() {
    try {
      await advanceRound(code, game.round_index, TOTAL_ROUNDS)
    } catch (err) {
      setError(err.message || 'Could not advance to the next round.')
    }
  }

  function restart() {
    window.location.reload()
  }

  const currentRoundResult = history.find((h) => h.roundIndex === game?.round_index)

  return (
    <div className="app">
      <header className="app-header">
        <h1>🎵 Song Wars</h1>
      </header>

      {error && <p className="error">{error}</p>}

      <audio ref={audioRef} style={{ display: 'none' }} />

      {phase === 'lobby' && <Lobby onJoined={handleJoined} />}

      {phase === 'waiting' && (
        <WaitingRoom
          code={code}
          players={players}
          isHost={myPlayer?.slot === 0}
          onStart={startGame}
          starting={starting}
        />
      )}

      {phase === 'wheel-genre' && (
        <div className="screen">
          <Wheel options={GENRES} title="Spin for Genre" resultLabel="Your genre" onResult={lockGenre} />
        </div>
      )}

      {phase === 'wheel-artist' && myGenre && (
        <div className="screen">
          <Wheel
            options={myGenre.artists}
            title="Spin for Artist"
            subtitle={myGenre.name}
            resultLabel="Your artist"
            onResult={lockArtist}
          />
        </div>
      )}

      {phase === 'wheel-waiting' && (
        <div className="screen">
          <h2>You're locked to {myLatest?.artist}</h2>
          <p className="hint">
            {opponentLocked ? `${opponent.name} is locked in too.` : `Waiting for ${opponent?.name || 'your opponent'} to spin…`}
          </p>
        </div>
      )}

      {phase === 'round-loop' && game && players.length === 2 && (
        <>
          {!bothSubmitted && !timedOut && !iSubmitted && (
            <SongSearch
              player={myLatest.name}
              lockedArtist={myLatest.artist}
              prompt={game.prompts[game.round_index]}
              onSubmit={handleSubmitSong}
              onForfeit={handleSearchExpire}
              initialSeconds={initialSeconds}
              onBeforeSubmit={primeAudio}
            />
          )}

          {!bothSubmitted && !timedOut && iSubmitted && (
            <div className="screen">
              <p className="eyebrow">
                Round {game.round_index + 1} of {TOTAL_ROUNDS}
              </p>
              <h2>You submitted {mySubmissionRow.track.title}</h2>
              <p className="hint">Waiting for {opponent?.name}…</p>
            </div>
          )}

          {bothSubmitted && !myVoteRow && !revealDone && orderedSubmissions.length === 2 && (
            <RoundReveal
              game={game}
              code={code}
              orderedSubmissions={orderedSubmissions}
              audioRef={audioRef}
              onDone={() => setRevealDone(true)}
            />
          )}

          {bothSubmitted && !myVoteRow && revealDone && orderedSubmissions.length === 2 && (
            <VoteScreen voter={myLatest.name} submissions={orderedSubmissions} onVote={handleVote} />
          )}

          {bothSubmitted && myVoteRow && !oppVoteRow && (
            <div className="screen">
              <p className="hint">Vote locked in ✓</p>
              <p className="hint">Waiting for {opponent?.name} to vote…</p>
            </div>
          )}

          {((bothSubmitted && bothVoted) || (timedOut && !bothSubmitted)) &&
            (currentRoundResult ? (
              <RoundScore
                result={currentRoundResult}
                scores={scores}
                roundNumber={game.round_index + 1}
                totalRounds={TOTAL_ROUNDS}
                onContinue={handleContinueRound}
              />
            ) : (
              <div className="screen">
                <p className="hint">Tallying the round…</p>
              </div>
            ))}
        </>
      )}

      {phase === 'end' && <EndScreen scores={scores} history={history} onRestart={restart} />}
    </div>
  )
}
