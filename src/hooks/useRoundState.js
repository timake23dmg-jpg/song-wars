import { useEffect, useMemo, useState } from 'react'
import { submitSong, castVote, revealExpiredRound, fetchRoundSubmissions, fetchRoundVotes, roundPlayOrder } from '../lib/game'

// Owns everything about the round currently being played: submission/vote
// state scoped to *this* round specifically (guarding against the stale-
// round-data race described below), the reveal/vote/announce sub-steps
// within a round, the running score for the current match, and recording
// each round's outcome into history exactly once. Generalized in v3 to any
// number of players (2 to whatever the room has) rather than a hardcoded
// "me vs. opponent" — see ROUND OUTCOME RULES below for how partial
// submissions are handled.
export function useRoundState({ code, phase, game, players, myPlayer, roundSubmissions, roundVotes, setRoundSubmissions, setRoundVotes, setError }) {
  const [timedOut, setTimedOut] = useState(false)
  const [revealDone, setRevealDone] = useState(false)
  const [roundAnnounced, setRoundAnnounced] = useState(false)
  const [history, setHistory] = useState([])

  // Reset per-round local state whenever the shared round changes.
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

  // roundSubmissions/roundVotes are cleared via an async fetch when a new
  // round starts, but game.round_index updates immediately via realtime —
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
  const iSubmitted = !!mySubmissionRow
  const allSubmitted = players.length > 0 && currentRoundSubmissions.length === players.length
  const submittedCount = currentRoundSubmissions.length

  const myVoteRow = currentRoundVotes.find((v) => v.voter_player_id === myPlayer?.id) || null
  const allVoted = players.length > 0 && currentRoundVotes.length === players.length

  // ROUND OUTCOME RULES (generalized from the 2-player version):
  // - Everyone submits -> normal reveal + vote among all of them.
  // - Timer runs out with a partial set (RLS reveals whatever exists once
  //   reveal_expired_round fires — see handleSearchExpire below):
  //   - Nobody submitted: a tie, no point awarded.
  //   - Exactly one submitted: they win outright, no vote needed (a vote
  //     among one candidate isn't meaningful).
  //   - 2+ but not everyone submitted: reveal + vote among just those who
  //     did — anyone in the room (submitter or not) can still vote, matching
  //     the existing self-voting-allowed philosophy of not restricting votes.
  const readyForRevealAndVote = allSubmitted || (timedOut && submittedCount >= 2)
  const isAutoWinByForfeit = timedOut && submittedCount === 1
  const isTieByForfeit = timedOut && submittedCount === 0

  const order = useMemo(
    () => roundPlayOrder(code, game?.round_index ?? 0, currentRoundSubmissions.length),
    [code, game?.round_index, currentRoundSubmissions.length]
  )

  const orderedSubmissions = useMemo(() => {
    if (!readyForRevealAndVote || currentRoundSubmissions.length === 0) return []
    const bySubmissionIndex = currentRoundSubmissions.map((row) => {
      const player = players.find((p) => p.id === row.player_id)
      return { player: player?.name ?? '?', playerId: row.player_id, track: row.track }
    })
    return order.map((i) => bySubmissionIndex[i]).filter(Boolean)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyForRevealAndVote, currentRoundSubmissions, players, order])

  // Running win tally for the match — derived fresh from history each
  // render rather than a separately-accumulated counter, so it can never
  // drift out of sync.
  const currentMatchScores = useMemo(() => {
    if (players.length === 0) return {}
    const out = {}
    for (const p of players) out[p.name] = 0
    history.forEach((h) => {
      if (h.winner) out[h.winner] = (out[h.winner] || 0) + 1
    })
    return out
  }, [history, players])

  // Record each round's outcome exactly once, whether it resolved by
  // everyone voting, a forfeit auto-win/tie, or a partial-submission vote.
  useEffect(() => {
    if (phase !== 'round-loop' || !game || players.length === 0) return
    const idx = game.round_index
    if (history.some((h) => h.roundIndex === idx)) return

    let outcome = null
    if (readyForRevealAndVote && allVoted) {
      // Tally votes by who they were cast for, not by array position — this
      // is what lets it work for any number of candidates without needing a
      // fixed-size slot array.
      const tally = {}
      currentRoundVotes.forEach((v) => {
        if (v.voted_for_player_id) tally[v.voted_for_player_id] = (tally[v.voted_for_player_id] || 0) + 1
      })
      const entries = Object.entries(tally)
      const max = entries.length ? Math.max(...entries.map(([, c]) => c)) : 0
      const topIds = entries.filter(([, c]) => c === max).map(([id]) => id)

      if (max > 0 && topIds.length === 1) {
        const winPlayer = players.find((p) => p.id === topIds[0])
        const winRow = currentRoundSubmissions.find((s) => s.player_id === topIds[0])
        outcome = winPlayer && winRow ? { winner: winPlayer.name, winningTrack: winRow.track } : { winner: null, winningTrack: null }
      } else {
        outcome = { winner: null, winningTrack: null } // tie, or nobody voted for anyone
      }
    } else if (isAutoWinByForfeit) {
      const winRow = currentRoundSubmissions[0]
      const winPlayer = players.find((p) => p.id === winRow?.player_id)
      outcome = winPlayer && winRow ? { winner: winPlayer.name, winningTrack: winRow.track } : { winner: null, winningTrack: null }
    } else if (isTieByForfeit) {
      outcome = { winner: null, winningTrack: null }
    } else {
      return
    }

    setHistory((prev) => {
      // Re-check against the actual latest state, not the closure's `history`
      // — belt-and-braces against this effect's body running more than once
      // for the same round before a re-render lets the outer guard see it.
      if (prev.some((h) => h.roundIndex === idx)) return prev
      return [...prev, { roundIndex: idx, prompt: game.prompts[idx], winner: outcome.winner, winningTrack: outcome.winningTrack }]
    })
  }, [phase, game, players, currentRoundSubmissions, currentRoundVotes, readyForRevealAndVote, allVoted, isAutoWinByForfeit, isTieByForfeit])

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

  const currentRoundResult = history.find((h) => h.roundIndex === game?.round_index)

  // A single exhaustive state for the round, so the render side can just
  // switch on one value instead of re-deriving overlapping boolean
  // conditions in multiple places (which is exactly how an earlier version
  // of this ended up with a real gap — a combination where nothing at all
  // would render). 'scoring' is the catch-all for "the outcome-recording
  // effect above hasn't populated currentRoundResult yet" — always shows
  // *something* (a "Tallying…" message) rather than a blank screen.
  const roundStage = currentRoundResult
    ? 'done'
    : !iSubmitted && !timedOut
    ? 'submitting'
    : iSubmitted && !readyForRevealAndVote && !timedOut
    ? 'waiting-submissions'
    : readyForRevealAndVote && !myVoteRow && !revealDone
    ? 'revealing'
    : readyForRevealAndVote && !myVoteRow && revealDone
    ? 'voting'
    : readyForRevealAndVote && myVoteRow && !allVoted
    ? 'waiting-votes'
    : 'scoring'

  return {
    roundStage,
    timedOut,
    revealDone,
    setRevealDone,
    roundAnnounced,
    setRoundAnnounced,
    history,
    initialSeconds,
    mySubmissionRow,
    iSubmitted,
    allSubmitted,
    submittedCount,
    currentRoundSubmissions,
    myVoteRow,
    allVoted,
    voteCount: currentRoundVotes.length,
    readyForRevealAndVote,
    isAutoWinByForfeit,
    isTieByForfeit,
    orderedSubmissions,
    currentMatchScores,
    currentRoundResult,
    handleSubmitSong,
    handleSearchExpire,
    handleVote,
  }
}
