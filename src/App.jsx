import { useEffect, useState } from 'react'
import { GENRES } from './data/genres'
import { drawPrompts, PROMPTS } from './data/prompts'
import { supabase } from './lib/supabase'
import { updateGameSettings } from './lib/room'
import { advanceRound, endGame } from './lib/game'
import { DEFAULT_ROUNDS, checkPointsLeagueOutcome } from './lib/pointsLeague'
import { useAudioPriming } from './hooks/useAudioPriming'
import { useRoomConnection } from './hooks/useRoomConnection'
import { useRoundState } from './hooks/useRoundState'
import Wheel from './components/Wheel'
import Lobby from './components/Lobby'
import WaitingRoom from './components/WaitingRoom'
import SongSearch from './components/SongSearch'
import RoundReveal from './components/RoundReveal'
import VoteScreen from './components/VoteScreen'
import RoundScore from './components/RoundScore'
import RoundAnnounce from './components/RoundAnnounce'
import EndScreen from './components/EndScreen'

export default function App() {
  const [phase, setPhase] = useState('lobby')
  const [code, setCode] = useState(null)
  const [myPlayer, setMyPlayer] = useState(null)
  const [myGenre, setMyGenre] = useState(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState(null)

  const { audioRef, primeAudio } = useAudioPriming()
  const { players, game, roundSubmissions, roundVotes, setRoundSubmissions, setRoundVotes } =
    useRoomConnection(code)

  const myLatest = players.find((p) => p.id === myPlayer?.id) || myPlayer

  const {
    timedOut,
    revealDone,
    setRevealDone,
    roundAnnounced,
    setRoundAnnounced,
    history,
    initialSeconds,
    roundStage,
    mySubmissionRow,
    submittedCount,
    voteCount,
    orderedSubmissions,
    currentMatchScores,
    currentRoundResult,
    handleSubmitSong,
    handleSearchExpire,
    handleVote,
  } = useRoundState({
    code,
    phase,
    game,
    players,
    myPlayer,
    roundSubmissions,
    roundVotes,
    setRoundSubmissions,
    setRoundVotes,
    setError,
  })

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
      // Draw the whole pool, shuffled — more than enough for a Points League
      // match of DEFAULT_ROUNDS rounds, with headroom to raise the round
      // count later without running out.
      const prompts = drawPrompts(PROMPTS.length)
      const { error: updateError } = await supabase
        .from('games')
        .update({ status: 'wheel', prompts, round_index: 0, round_started_at: null, total_rounds: DEFAULT_ROUNDS })
        .eq('code', code)
      if (updateError) throw updateError
    } catch (err) {
      setError(err.message || 'Could not start the game.')
    } finally {
      setStarting(false)
    }
  }

  async function handleSetMode(mode) {
    try {
      await updateGameSettings(code, { mode })
    } catch (err) {
      setError(err.message || 'Could not update the mode.')
    }
  }

  async function handleSetDifficulty(difficulty) {
    try {
      await updateGameSettings(code, { difficulty })
    } catch (err) {
      setError(err.message || 'Could not update the difficulty.')
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

  const iAmLocked = !!myLatest?.artist
  const lockedCount = players.filter((p) => !!p.artist).length
  const allLocked = players.length > 0 && lockedCount === players.length

  // Once everyone is locked in, flip the room from "wheel" to "playing" and
  // start round 0's clock. Guarded by .eq('status','wheel') so if multiple
  // clients race to do this, only the first write takes effect.
  useEffect(() => {
    if (phase === 'wheel-waiting' && iAmLocked && allLocked && game?.status === 'wheel') {
      supabase
        .from('games')
        .update({ status: 'playing', round_started_at: new Date().toISOString() })
        .eq('code', code)
        .eq('status', 'wheel')
        .then(({ error: updateError }) => {
          if (updateError) console.error(updateError)
        })
    }
  }, [phase, iAmLocked, allLocked, game?.status, code])

  // Follow the shared game status into (and out of) the round loop.
  useEffect(() => {
    if (!game) return
    if (game.status === 'finished') {
      if (phase !== 'end') setPhase('end')
      return
    }
    if (game.status !== 'playing') return
    if (phase !== 'round-loop') setPhase('round-loop')
  }, [game, phase])

  // Checks whether the Points League match is decided (every round of
  // total_rounds played); if so, ends the game, otherwise advances to the
  // next round.
  async function handleContinueRound() {
    try {
      const outcome = checkPointsLeagueOutcome(history, game.total_rounds, players)
      if (!outcome) {
        await advanceRound(code, game.round_index)
      } else {
        await endGame(code)
      }
    } catch (err) {
      setError(err.message || 'Could not continue.')
    }
  }

  function restart() {
    window.location.reload()
  }

  const finalOutcome = checkPointsLeagueOutcome(history, game?.total_rounds ?? DEFAULT_ROUNDS, players) || {
    winners: [],
  }

  const notSubmittedCount = Math.max(0, players.length - submittedCount)
  const notVotedCount = Math.max(0, players.length - voteCount)

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
          game={game}
          onSetMode={handleSetMode}
          onSetDifficulty={handleSetDifficulty}
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
            {allLocked
              ? 'Everyone is locked in!'
              : `Waiting for ${players.length - lockedCount} more player${players.length - lockedCount === 1 ? '' : 's'} to spin…`}
          </p>
        </div>
      )}

      {phase === 'round-loop' && game && players.length >= 2 && !roundAnnounced && (
        <RoundAnnounce
          label={`Round ${game.round_index + 1} of ${game.total_rounds}`}
          scores={currentMatchScores}
          onDone={() => setRoundAnnounced(true)}
        />
      )}

      {phase === 'round-loop' && game && players.length >= 2 && roundAnnounced && (
        <>
          {roundStage === 'submitting' && (
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

          {roundStage === 'waiting-submissions' && (
            <div className="screen">
              <p className="eyebrow">
                Round {game.round_index + 1} of {game.total_rounds}
              </p>
              <h2>You submitted {mySubmissionRow.track.title}</h2>
              <p className="hint">
                Waiting for {notSubmittedCount} more player{notSubmittedCount === 1 ? '' : 's'}…
              </p>
            </div>
          )}

          {roundStage === 'revealing' && orderedSubmissions.length > 0 && (
            <RoundReveal
              game={game}
              code={code}
              orderedSubmissions={orderedSubmissions}
              audioRef={audioRef}
              onDone={() => setRevealDone(true)}
            />
          )}

          {roundStage === 'voting' && orderedSubmissions.length > 0 && (
            <VoteScreen voter={myLatest.name} submissions={orderedSubmissions} onVote={handleVote} />
          )}

          {roundStage === 'waiting-votes' && (
            <div className="screen">
              <p className="hint">Vote locked in ✓</p>
              <p className="hint">
                Waiting for {notVotedCount} more player{notVotedCount === 1 ? '' : 's'} to vote…
              </p>
            </div>
          )}

          {roundStage === 'scoring' && (
            <div className="screen">
              <p className="hint">Tallying the round…</p>
            </div>
          )}

          {roundStage === 'done' && currentRoundResult && (
            <RoundScore
              result={currentRoundResult}
              scores={currentMatchScores}
              roundLabel={`Round ${game.round_index + 1} of ${game.total_rounds}`}
              continueLabel={checkPointsLeagueOutcome(history, game.total_rounds, players) ? 'See results' : 'Next round'}
              onContinue={handleContinueRound}
            />
          )}
        </>
      )}

      {phase === 'end' && (
        <EndScreen winners={finalOutcome.winners} scores={currentMatchScores} history={history} onRestart={restart} />
      )}
    </div>
  )
}
