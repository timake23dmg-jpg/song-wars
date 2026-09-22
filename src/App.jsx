import { useEffect, useState } from 'react'
import { GENRES } from './data/genres'
import { drawPrompts } from './data/prompts'
import { supabase } from './lib/supabase'
import { subscribeToRoom, fetchPlayers, fetchGame } from './lib/room'
import Wheel from './components/Wheel'
import Lobby from './components/Lobby'
import WaitingRoom from './components/WaitingRoom'

const TOTAL_ROUNDS = 10

export default function App() {
  const [phase, setPhase] = useState('lobby') // lobby | waiting | wheel-genre | wheel-artist | wheel-waiting | round-loop-tbd
  const [code, setCode] = useState(null)
  const [myPlayer, setMyPlayer] = useState(null)
  const [players, setPlayers] = useState([])
  const [game, setGame] = useState(null)
  const [myGenre, setMyGenre] = useState(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState(null)

  const opponent = players.find((p) => p.id !== myPlayer?.id) || null
  const myLatest = players.find((p) => p.id === myPlayer?.id) || myPlayer

  // Once we've joined/hosted a room, subscribe to live changes on it.
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
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [code])

  // React to the room filling up / the host starting the game.
  useEffect(() => {
    if (phase === 'waiting' && players.length >= 2 && game?.status === 'playing') {
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
        .update({ status: 'playing', prompts, round_index: 0, round_started_at: new Date().toISOString() })
        .eq('code', code)
      if (updateError) throw updateError
      // The realtime subscription above will flip phase to 'wheel-genre' for both clients.
    } catch (err) {
      setError(err.message || 'Could not start the game.')
    } finally {
      setStarting(false)
    }
  }

  async function lockGenre(genre) {
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

  useEffect(() => {
    if (phase === 'wheel-waiting' && iAmLocked && opponentLocked) {
      setPhase('round-loop-tbd')
    }
  }, [phase, iAmLocked, opponentLocked])

  return (
    <div className="app">
      <header className="app-header">
        <h1>🎵 Song Wars</h1>
      </header>

      {error && <p className="error">{error}</p>}

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
          <p className="eyebrow">Your wheel — 1 of 2</p>
          <Wheel options={GENRES} label="genre" onResult={lockGenre} />
        </div>
      )}

      {phase === 'wheel-artist' && myGenre && (
        <div className="screen">
          <p className="eyebrow">Your wheel — 2 of 2 ({myGenre.name})</p>
          <Wheel options={myGenre.artists} label="artist" onResult={lockArtist} />
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

      {phase === 'round-loop-tbd' && (
        <div className="screen">
          <h2>Connected! 🎉</h2>
          <p>
            {myLatest?.name} → {myLatest?.artist}
          </p>
          <p>
            {opponent?.name} → {opponent?.artist}
          </p>
          <p className="hint">
            Room and wheel sync are live. The round loop (search, hidden submissions, timer,
            voting) over the network is the next piece to wire up.
          </p>
        </div>
      )}
    </div>
  )
}
