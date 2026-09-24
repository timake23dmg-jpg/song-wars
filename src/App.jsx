import { useEffect, useMemo, useRef, useState } from 'react'
import { GENRES } from './data/genres'
import { drawPrompts, PROMPTS } from './data/prompts'
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
  offerDoubleOrNothing,
  acceptDoubleOrNothing,
  declineDoubleOrNothing,
  startBonusMatch,
  endGame,
} from './lib/game'
import { checkMatchOutcome, roundLabel, matchRoundNumber } from './lib/match'
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
  const [players, setPlayers] = useState([])
  const [game, setGame] = useState(null)
  const [myGenre, setMyGenre] = useState(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState(null)

  const [roundSubmissions, setRoundSubmissions] = useState([])
  const [roundVotes, setRoundVotes] = useState([])
  const [timedOut, setTimedOut] = useState(false)
  const [revealDone, setRevealDone] = useState(false)
  const [roundAnnounced, setRoundAnnounced] = useState(false)
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

  // Reset per-round local state whenever the shared round (or match) changes.
  useEffect(() => {
    if (!game || game.status !== 'playing') return
    setTimedOut(false)
    setRevealDone(false)
    setRoundAnnounced(false)
    fetchRoundSubmissions(code, game.round_index).then(setRoundSubmissions).catch(console.error)
    fetchRoundVotes(code, game.round_index).then(setRoundVotes).catch(console.error)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.round_index, game?.status])

  const initialSeconds = useMemo(() => {
    if (!game?.round_started_at) return 60
    const elapsed = (Date.now() - new Date(game.round_started_at).getTime()) / 1000
    return Math.max(0, Math.round(60 - elapsed))
  }, [game?.round_index, game?.round_started_at])

  // `roundSubmissions`/`roundVotes` are cleared via an async fetch when a new
  // round starts, but `game.round_index` updates immediately via realtime —
  // so there's a real window where the round number has already moved on
  // but this state still holds the *previous* round's rows. Filtering by
  // each row's own round_index (rather than trusting component state to
  // have caught up yet) closes that window without depending on effect
  // timing at all.
  const currentRoundSubmissions = useMemo(
    () => roundSubmissions.filter((s) => s.round_index === game?.round_index),
    [roundSubmissions, game?.round_index]
  )
  const currentRoundVotes = useMemo(
    () => roundVotes.filter((v) => v.round_index === game?.round_index),
    [roundVotes, game?.round_index]
  )

  const mySubmissionRow = currentRoundSubmissions.find((s) => s.player_id === myPlayer?.id) || null
  const oppSubmissionRow = currentRoundSubmissions.find((s) => s.player_id === opponent?.id) || null
  const iSubmitted = !!mySubmissionRow
  const bothSubmitted = iSubmitted && !!oppSubmissionRow

  const myVoteRow = currentRoundVotes.find((v) => v.voter_player_id === myPlayer?.id) || null
  const oppVoteRow = currentRoundVotes.find((v) => v.voter_player_id === opponent?.id) || null
  const bothVoted = !!myVoteRow && !!oppVoteRow

  const order = useMemo(() => roundPlayOrder(code, game?.round_index ?? 0), [code, game?.round_index])

  const orderedSubmissions = useMemo(() => {
    if (!bothSubmitted || players.length !== 2) return []
    const bySlot = [null, null]
    for (const p of players) {
      const row = currentRoundSubmissions.find((s) => s.player_id === p.id)
      if (row) bySlot[p.slot] = { player: p.name, playerId: p.id, track: row.track }
    }
    if (!bySlot[0] || !bySlot[1]) return []
    return order.map((i) => bySlot[i])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bothSubmitted, players, currentRoundSubmissions, order])

  // Running win tally for whichever match (main or bonus) is currently in
  // progress — derived fresh from history each render rather than a
  // separately-accumulated counter, so it can never drift out of sync.
  const currentMatchScores = useMemo(() => {
    if (players.length !== 2 || !game) return {}
    const out = { [players[0].name]: 0, [players[1].name]: 0 }
    history
      .filter((h) => h.matchType === game.match_type)
      .forEach((h) => {
        if (h.winner) out[h.winner] = (out[h.winner] || 0) + 1
      })
    return out
  }, [history, players, game?.match_type])

  // Record each round's outcome exactly once, whether it resolved by both
  // players voting or by the timer running out (forfeit/tie).
  useEffect(() => {
    if (phase !== 'round-loop' || !game || players.length !== 2) return
    const idx = game.round_index
    if (history.some((h) => h.roundIndex === idx && h.matchType === game.match_type)) return

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
        const winRow = currentRoundSubmissions.find((s) => s.player_id === winPlayer.id)
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

    const matchType = game.match_type
    setHistory((prev) => {
      // Re-check against the actual latest state, not the closure's `history`
      // — belt-and-braces against this effect's body running more than once
      // for the same round before a re-render lets the outer guard see it
      // (e.g. two realtime events landing in close succession).
      if (prev.some((h) => h.roundIndex === idx && h.matchType === matchType)) return prev
      return [
        ...prev,
        {
          roundIndex: idx,
          matchType,
          prompt: game.prompts[idx],
          winner: outcome.winner,
          winningTrack: outcome.winningTrack,
        },
      ]
    })
  }, [phase, game, players, currentRoundSubmissions, currentRoundVotes, timedOut, bothSubmitted, bothVoted])

  async function handleSubmitSong(track) {
    try {
      const roundIndex = game.round_index
      await submitSong(code, roundIndex, myPlayer.id, track)
      setRoundSubmissions((prev) =>
        prev.some((s) => s.player_id === myPlayer.id && s.round_index === roundIndex)
          ? prev
          : [...prev, { game_code: code, round_index: roundIndex, player_id: myPlayer.id, track, revealed: false }]
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
      const roundIndex = game.round_index
      await castVote(code, roundIndex, myPlayer.id, votedForPlayerId)
      setRoundVotes((prev) =>
        prev.some((v) => v.voter_player_id === myPlayer.id && v.round_index === roundIndex)
          ? prev
          : [
              ...prev,
              { round_index: roundIndex, voter_player_id: myPlayer.id, voted_for_player_id: votedForPlayerId, revealed: false },
            ]
      )
    } catch (err) {
      setError(err.message || 'Could not cast your vote.')
    }
  }

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

  const currentRoundResult = history.find(
    (h) => h.roundIndex === game?.round_index && h.matchType === game?.match_type
  )

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
