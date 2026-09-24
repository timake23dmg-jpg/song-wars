import { useEffect, useMemo, useState } from 'react'
import { submitSong, castVote, revealExpiredRound, fetchRoundSubmissions, fetchRoundVotes, roundPlayOrder } from '../lib/game'

// Owns everything about the round currently being played: submission/vote
// state scoped to *this* round specifically (guarding against the stale-
// round-data race described below), the reveal/vote/announce sub-steps
// within a round, the running score for the current match, and recording
// each round's outcome into history exactly once. This is deliberately the
// densest hook in the app — it's the part most likely to be touched again
// for future round-loop changes, which is exactly why it's split out on its
// own rather than left inline in App.jsx.
export function useRoundState({ code, phase, game, players, myPlayer, opponent, myLatest, roundSubmissions, roundVotes, setRoundSubmissions, setRoundVotes, setError }) {
  const [timedOut, setTimedOut] = useState(false)
  const [revealDone, setRevealDone] = useState(false)
  const [roundAnnounced, setRoundAnnounced] = useState(false)
  const [history, setHistory] = useState([])

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

  const currentRoundResult = history.find(
    (h) => h.roundIndex === game?.round_index && h.matchType === game?.match_type
  )

  return {
    timedOut,
    revealDone,
    setRevealDone,
    roundAnnounced,
    setRoundAnnounced,
    history,
    initialSeconds,
    mySubmissionRow,
    oppSubmissionRow,
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
  }
}
