import { useEffect, useRef, useState } from 'react'
import { subscribeToRoom, fetchPlayers, fetchGame } from '../lib/room'
import { fetchRoundSubmissions, fetchRoundVotes } from '../lib/game'

// Owns the live connection to a room once joined: the players list, the
// shared game row, and the current round's submissions/votes, all kept in
// sync via one realtime subscription. This is the data layer only — it
// doesn't know about game phases or rules, just "what does the server say
// right now."
export function useRoomConnection(code) {
  const [players, setPlayers] = useState([])
  const [game, setGame] = useState(null)
  const [roundSubmissions, setRoundSubmissions] = useState([])
  const [roundVotes, setRoundVotes] = useState([])

  // postgres_changes payloads for submissions/votes don't carry which round
  // they're for in a way we can filter server-side by the time they arrive,
  // so the realtime callbacks always refetch "the current round" — this ref
  // gives them a non-stale read of that without needing to resubscribe every
  // time the round changes.
  const gameRef = useRef(null)
  useEffect(() => {
    gameRef.current = game
  }, [game])

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

  return { players, game, roundSubmissions, roundVotes, setRoundSubmissions, setRoundVotes }
}
