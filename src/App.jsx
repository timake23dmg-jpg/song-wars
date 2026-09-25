import { useEffect, useState } from 'react'
import { GENRES } from './data/genres'
import { drawPrompts, PROMPTS } from './data/prompts'
import { supabase } from './lib/supabase'
import { updateGameSettings } from './lib/room'
import { advanceRound, endGame, eliminatePlayer } from './lib/game'
import { DEFAULT_ROUNDS, checkPointsLeagueOutcome } from './lib/pointsLeague'
import { roundParticipants, lowestScorers, checkEliminationOutcome } from './lib/elimination'
import { themedGenres } from './lib/theme'
import { themeById } from './data/themes'
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
  const isElimination = game?.mode === 'elimination'
  const isBlindMode = game?.mode === 'blind_mode'
  const roundPlayers = game ? roundParticipants(game, players) : players
  const iAmInRound = roundPlayers.some((p) => p.id === myPlayer?.id)

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
    roundPlayers,
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
      // match of DEFAULT_ROUNDS rounds (or however many an Elimination match
      // ends up taking), with headroom to spare.
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

  async function handleSetTheme(theme) {
    try {
      await updateGameSettings(code, { theme })
    } catch (err) {
      setError(err.message || 'Could not update the theme.')
    }
  }

  // Theme Night restricts which genres/artists the wheel can land on;
  // every other mode spins from the full, unrestricted pool.
  const wheelGenres = game?.mode === 'theme_night' ? themedGenres(themeById(game.theme)) : GENRES

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

  // Points League: checks whether every round of total_rounds has been
  // played. Elimination: checks the round's full vote tally for a tie at
  // the bottom — a tie routes into a tiebreak mini-round scoped to just
  // those players instead of eliminating anyone yet; a unique lowest
  // scorer gets eliminated, ending the game if only one player is left.
  async function handleContinueRound() {
    try {
      if (isElimination) {
        const lowest = lowestScorers(currentRoundResult.tally, currentRoundResult.participantIds)
        if (lowest.length > 1) {
          await advanceRound(code, game.round_index, { tiebreak_player_ids: lowest })
          return
        }
        if (lowest.length === 1) {
          // Computed from the room's active count *before* this elimination
          // (already accurate for every earlier elimination via realtime),
          // not by re-reading local state right after the write — avoids a
          // race against that write's own realtime update landing in time.
          const activeBeforeThisElimination = players.filter((p) => !p.eliminated_at).length
          await eliminatePlayer(code, lowest[0])
          const remaining = activeBeforeThisElimination - 1
          if (remaining <= 1) {
            await endGame(code)
          } else {
            await advanceRound(code, game.round_index, { tiebreak_player_ids: [] })
          }
        }
        return
      }

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

  const finalOutcome = isElimination
    ? { winners: checkEliminationOutcome(players) ? [checkEliminationOutcome(players)] : [] }
    : checkPointsLeagueOutcome(history, game?.total_rounds ?? DEFAULT_ROUNDS, players) || { winners: [] }

  const notSubmittedCount = Math.max(0, roundPlayers.length - submittedCount)
  const notVotedCount = Math.max(0, roundPlayers.length - voteCount)
  const isTiebreak = isElimination && (game?.tiebreak_player_ids?.length || 0) > 0
  const eliminationNote =
    isElimination && currentRoundResult
      ? (() => {
          const lowest = lowestScorers(currentRoundResult.tally, currentRoundResult.participantIds)
          if (lowest.length > 1) return "Tie for fewest votes — a tiebreak round decides who's out."
          const outPlayer = players.find((p) => p.id === lowest[0])
          return outPlayer ? `${outPlayer.name} had the fewest votes and is eliminated.` : null
        })()
      : null
  const roundLabelText = isElimination
    ? isTiebreak
      ? 'Tiebreak Round'
      : `Round ${game?.round_index + 1} · ${roundPlayers.length} players left`
    : `Round ${game?.round_index + 1} of ${game?.total_rounds}`

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
          onSetTheme={handleSetTheme}
          onStart={startGame}
          starting={starting}
        />
      )}

      {phase === 'wheel-genre' && (
        <div className="screen">
          <Wheel options={wheelGenres} title="Spin for Genre" resultLabel="Your genre" onResult={lockGenre} />
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

      {phase === 'round-loop' && game && players.length >= 2 && myLatest?.eliminated_at && (
        <div className="screen">
          <h2>You've been eliminated</h2>
          <p className="hint">Still watching — the game continues without you until there's a winner.</p>
        </div>
      )}

      {phase === 'round-loop' && game && players.length >= 2 && !myLatest?.eliminated_at && !iAmInRound && (
        <div className="screen">
          <h2>Sitting this one out</h2>
          <p className="hint">A tiebreak round is happening between two other players — back after it resolves.</p>
        </div>
      )}

      {phase === 'round-loop' && game && players.length >= 2 && iAmInRound && !roundAnnounced && (
        <RoundAnnounce
          label={roundLabelText}
          scores={isElimination ? {} : currentMatchScores}
          onDone={() => setRoundAnnounced(true)}
        />
      )}

      {phase === 'round-loop' && game && players.length >= 2 && iAmInRound && roundAnnounced && (
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
              <p className="eyebrow">{roundLabelText}</p>
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
              hidePlayer={isBlindMode}
              onDone={() => setRevealDone(true)}
            />
          )}

          {roundStage === 'voting' && orderedSubmissions.length > 0 && (
            <VoteScreen
              voter={myLatest.name}
              submissions={orderedSubmissions}
              hidePlayer={isBlindMode}
              onVote={handleVote}
            />
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
              scores={isElimination ? {} : currentMatchScores}
              roundLabel={roundLabelText}
              note={eliminationNote}
              continueLabel={
                isElimination
                  ? 'Continue'
                  : checkPointsLeagueOutcome(history, game.total_rounds, players)
                  ? 'See results'
                  : 'Next round'
              }
              onContinue={handleContinueRound}
            />
          )}
        </>
      )}

      {phase === 'end' && (
        <EndScreen
          winners={finalOutcome.winners}
          scores={isElimination ? {} : currentMatchScores}
          history={history}
          onRestart={restart}
        />
      )}
    </div>
  )
}
