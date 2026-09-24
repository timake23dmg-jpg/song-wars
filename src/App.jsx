import { useEffect, useMemo, useState } from 'react'
import { GENRES } from './data/genres'
import { drawPrompts, PROMPTS } from './data/prompts'
import { supabase } from './lib/supabase'
import { updateGameSettings } from './lib/room'
import {
  advanceRound,
  offerDoubleOrNothing,
  acceptDoubleOrNothing,
  declineDoubleOrNothing,
  startBonusMatch,
  endGame,
} from './lib/game'
import { checkMatchOutcome, roundLabel, matchRoundNumber } from './lib/match'
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
import DoubleOrNothingOffer from './components/DoubleOrNothingOffer'
import GenrePicker from './components/GenrePicker'
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

  const opponent = players.find((p) => p.id !== myPlayer?.id) || null
  const myLatest = players.find((p) => p.id === myPlayer?.id) || myPlayer

  const {
    timedOut,
    revealDone,
    setRevealDone,
    roundAnnounced,
    setRoundAnnounced,
    history,
    initialSeconds,
    mySubmissionRow,
    iSubmitted,
    bothSubmitted,
    myVoteRow,
    oppVoteRow,
    bothVoted,
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
    opponent,
    myLatest,
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
      // Draw the whole pool, shuffled — Best of 5 can run into sudden death,
      // and Double or Nothing continues from wherever the main match left
      // off, so there's no fixed round count to size this to; drawing
      // everything up front guarantees no repeats across either match.
      const prompts = drawPrompts(PROMPTS.length)
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

  // Follow the shared game status/offer state into (and out of) each phase.
  useEffect(() => {
    if (!game) return
    if (game.status === 'finished') {
      if (phase !== 'end') setPhase('end')
      return
    }
    if (game.status !== 'playing') return

    // Compute the target phase purely from `game`, independent of the
    // current `phase` — comparing against `phase` mid-computation (as an
    // earlier version of this effect did) causes it to flip-flop forever,
    // since each branch's own "already there" check made a DIFFERENT later
    // branch match once phase changed, and that branch's write re-triggered
    // the first branch again. Only the final phase !== target check should
    // ever reference the current phase.
    let target
    if (game.bonus_offer_status === 'pending') {
      target = 'bonus-offer'
    } else if (game.bonus_offer_status === 'accepted' && game.match_type === 'main') {
      // Preserve the loser's own genre-pick vs artist-wheel sub-step instead
      // of forcing it back to the first one on every re-render.
      target = phase === 'bonus-genre-pick' || phase === 'bonus-artist-wheel' ? phase : 'bonus-genre-pick'
    } else {
      target = 'round-loop'
    }
    if (phase !== target) setPhase(target)
  }, [game, phase])

  // [R1] Checks whether the current match (main or bonus) is now decided; if
  // so, routes to Double or Nothing (after main) or ends the game (after
  // bonus) instead of just advancing to another round.
  async function handleContinueRound() {
    try {
      const matchHistory = history.filter((h) => h.matchType === game.match_type)
      const winnerName = checkMatchOutcome(matchHistory, game.match_type, players)

      if (!winnerName) {
        await advanceRound(code, game.round_index)
        return
      }

      if (game.match_type === 'main') {
        const loser = players.find((p) => p.name !== winnerName)
        await offerDoubleOrNothing(code, game.round_index, loser?.id ?? null)
      } else {
        const bonusWinner = players.find((p) => p.name === winnerName)
        const loserWonBonus = bonusWinner?.id === game.loser_player_id
        await endGame(code, { doubleWin: !loserWonBonus })
      }
    } catch (err) {
      setError(err.message || 'Could not continue.')
    }
  }

  const isLoser = !!game?.loser_player_id && myPlayer?.id === game.loser_player_id
  const mainMatchScores = useMemo(() => {
    if (players.length !== 2) return {}
    const out = { [players[0].name]: 0, [players[1].name]: 0 }
    history
      .filter((h) => h.matchType === 'main')
      .forEach((h) => {
        if (h.winner) out[h.winner] = (out[h.winner] || 0) + 1
      })
    return out
  }, [history, players])
  const finalScoreText = `Final score: ${Object.entries(mainMatchScores)
    .map(([name, pts]) => `${name} ${pts}`)
    .join(' — ')}`

  async function handleAcceptDoN() {
    try {
      await acceptDoubleOrNothing(code)
    } catch (err) {
      setError(err.message || 'Could not accept Double or Nothing.')
    }
  }
  async function handleDeclineDoN() {
    try {
      await declineDoubleOrNothing(code)
    } catch (err) {
      setError(err.message || 'Could not end the game.')
    }
  }

  function pickBonusGenre(genre) {
    setMyGenre(genre)
    setPhase('bonus-artist-wheel')
  }

  async function lockBonusArtist(artist) {
    try {
      const { error: updateError } = await supabase
        .from('players')
        .update({ genre: myGenre.name, artist })
        .eq('id', myPlayer.id)
      if (updateError) throw updateError
      await startBonusMatch(code, game.round_index)
    } catch (err) {
      setError(err.message || 'Could not save your pick.')
    }
  }

  function restart() {
    window.location.reload()
  }

  const bonusHistory = useMemo(() => history.filter((h) => h.matchType === 'bonus'), [history])
  const finalOutcome = useMemo(() => {
    if (!game || players.length !== 2) return { winnerName: null, doubleWin: false }
    if (game.match_type === 'bonus') {
      return { winnerName: checkMatchOutcome(bonusHistory, 'bonus', players), doubleWin: game.double_win }
    }
    const mainHistory = history.filter((h) => h.matchType === 'main')
    return { winnerName: checkMatchOutcome(mainHistory, 'main', players), doubleWin: false }
  }, [game, players, history, bonusHistory])

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
            {opponentLocked ? `${opponent.name} is locked in too.` : `Waiting for ${opponent?.name || 'your opponent'} to spin…`}
          </p>
        </div>
      )}

      {phase === 'round-loop' && game && players.length === 2 && !roundAnnounced && (
        <RoundAnnounce
          label={roundLabel(game.match_type, matchRoundNumber(game))}
          scores={currentMatchScores}
          onDone={() => setRoundAnnounced(true)}
        />
      )}

      {phase === 'round-loop' && game && players.length === 2 && roundAnnounced && (
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
              <p className="eyebrow">{roundLabel(game.match_type, matchRoundNumber(game))}</p>
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
                scores={currentMatchScores}
                roundLabel={roundLabel(game.match_type, matchRoundNumber(game))}
                continueLabel={
                  checkMatchOutcome(
                    history.filter((h) => h.matchType === game.match_type),
                    game.match_type,
                    players
                  )
                    ? 'See results'
                    : 'Next round'
                }
                onContinue={handleContinueRound}
              />
            ) : (
              <div className="screen">
                <p className="hint">Tallying the round…</p>
              </div>
            ))}
        </>
      )}

      {phase === 'bonus-offer' && (
        <DoubleOrNothingOffer
          isLoser={isLoser}
          finalScoreText={finalScoreText}
          onAccept={handleAcceptDoN}
          onDecline={handleDeclineDoN}
        />
      )}

      {phase === 'bonus-genre-pick' &&
        (isLoser ? (
          <GenrePicker genres={GENRES} onPick={pickBonusGenre} />
        ) : (
          <div className="screen">
            <p className="hint">Waiting for {opponent?.name} to pick a new genre for Double or Nothing…</p>
          </div>
        ))}

      {phase === 'bonus-artist-wheel' &&
        (isLoser && myGenre ? (
          <div className="screen">
            <Wheel
              options={myGenre.artists}
              title="Spin for Artist"
              subtitle={myGenre.name}
              resultLabel="Your artist"
              onResult={lockBonusArtist}
            />
          </div>
        ) : (
          <div className="screen">
            <p className="hint">Waiting for {opponent?.name} to spin their new artist…</p>
          </div>
        ))}

      {phase === 'end' && (
        <EndScreen
          winnerName={finalOutcome.winnerName}
          doubleWin={finalOutcome.doubleWin}
          scores={game?.match_type === 'bonus' ? currentMatchScores : mainMatchScores}
          history={history}
          onRestart={restart}
        />
      )}
    </div>
  )
}
