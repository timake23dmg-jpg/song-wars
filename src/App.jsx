import { useEffect, useState } from 'react'
import { GENRES } from './data/genres'
import { drawPrompts } from './data/prompts'
import Wheel from './components/Wheel'
import PassDevice from './components/PassDevice'
import SongSearch from './components/SongSearch'
import RevealPlayback from './components/RevealPlayback'
import VoteScreen from './components/VoteScreen'
import RoundScore from './components/RoundScore'
import EndScreen from './components/EndScreen'

const TOTAL_ROUNDS = 10

function initialPlayers() {
  return [
    { name: 'Player 1', genre: null, artist: null },
    { name: 'Player 2', genre: null, artist: null },
  ]
}

export default function App() {
  const [phase, setPhase] = useState('names')
  const [players, setPlayers] = useState(initialPlayers)
  const [prompts, setPrompts] = useState([])
  const [roundIndex, setRoundIndex] = useState(0)
  const [submissions, setSubmissions] = useState([null, null])
  const [votes, setVotes] = useState([null, null])
  const [scores, setScores] = useState({})
  const [history, setHistory] = useState([])
  const [roundResult, setRoundResult] = useState(null)

  const currentPrompt = prompts[roundIndex]

  function updatePlayer(idx, patch) {
    setPlayers((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)))
  }

  function startNames(e) {
    e.preventDefault()
    setPhase('genre-0')
  }

  function beginGame() {
    setPrompts(drawPrompts(TOTAL_ROUNDS))
    setScores({ [players[0].name]: 0, [players[1].name]: 0 })
    setRoundIndex(0)
    setPhase('prompt')
  }

  function resetRound() {
    setSubmissions([null, null])
    setVotes([null, null])
    setRoundResult(null)
  }

  function goToSearch0() {
    resetRound()
    setPhase('handoff-search-0')
  }

  function handleSubmit0(track) {
    setSubmissions((prev) => [{ player: players[0].name, track }, prev[1]])
    setPhase('handoff-search-1')
  }
  function handleForfeit0() {
    setSubmissions((prev) => [null, prev[1]])
    setPhase('handoff-search-1')
  }
  function handleSubmit1(track) {
    setSubmissions((prev) => [prev[0], { player: players[1].name, track }])
    setPhase('after-search')
  }
  function handleForfeit1() {
    setSubmissions((prev) => [prev[0], null])
    setPhase('after-search')
  }

  // Decide what happens once both players have had their submission turn.
  useEffect(() => {
    if (phase !== 'after-search') return
    const [a, b] = submissions
    if (a && b) {
      setPhase('reveal')
    } else if (a && !b) {
      finishRound(a.player, a.track, [a, null])
    } else if (!a && b) {
      finishRound(b.player, b.track, [null, b])
    } else {
      finishRound(null, null, [null, null])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  function finishRound(winner, winningTrack, subsForHistory) {
    if (winner) {
      setScores((prev) => ({ ...prev, [winner]: (prev[winner] || 0) + 1 }))
    }
    setRoundResult({ winner, winningTrack })
    setHistory((prev) => [
      ...prev,
      { prompt: currentPrompt, winner, winningTrack, submissions: subsForHistory },
    ])
    setPhase('score')
  }

  function onRevealDone() {
    setPhase('handoff-vote-0')
  }

  function handleVote0(idx) {
    setVotes((prev) => [idx, prev[1]])
    setPhase('handoff-vote-1')
  }
  function handleVote1(idx) {
    const v0 = votes[0]
    const v1 = idx
    setVotes([v0, v1])
    tally(v0, v1)
  }

  function tally(v0, v1) {
    const tallyCount = [0, 0]
    if (v0 !== null) tallyCount[v0] += 1
    if (v1 !== null) tallyCount[v1] += 1

    let winnerIdx = null
    if (tallyCount[0] > tallyCount[1]) winnerIdx = 0
    else if (tallyCount[1] > tallyCount[0]) winnerIdx = 1

    if (winnerIdx === null) {
      finishRound(null, null, submissions)
    } else {
      const winSub = submissions[winnerIdx]
      finishRound(winSub.player, winSub.track, submissions)
    }
  }

  function nextRound() {
    if (roundIndex + 1 >= TOTAL_ROUNDS) {
      setPhase('end')
    } else {
      setRoundIndex((r) => r + 1)
      resetRound()
      setPhase('prompt')
    }
  }

  function restart() {
    setPlayers(initialPlayers())
    setPrompts([])
    setRoundIndex(0)
    setSubmissions([null, null])
    setVotes([null, null])
    setScores({})
    setHistory([])
    setRoundResult(null)
    setPhase('names')
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>🎵 Song Wars</h1>
      </header>

      {phase === 'names' && (
        <form className="screen" onSubmit={startNames}>
          <h2>Who's playing?</h2>
          <label>
            Player 1
            <input
              value={players[0].name}
              onChange={(e) => updatePlayer(0, { name: e.target.value })}
              required
            />
          </label>
          <label>
            Player 2
            <input
              value={players[1].name}
              onChange={(e) => updatePlayer(1, { name: e.target.value })}
              required
            />
          </label>
          <button className="btn btn-primary" type="submit">
            Continue
          </button>
        </form>
      )}

      {phase === 'genre-0' && (
        <div className="screen">
          <p className="eyebrow">{players[0].name}'s wheel — 1 of 2</p>
          <Wheel
            options={GENRES}
            label="genre"
            onResult={(g) => updatePlayer(0, { genre: g })}
          />
          {players[0].genre && (
            <button className="btn btn-primary" onClick={() => setPhase('artist-0')}>
              Continue
            </button>
          )}
        </div>
      )}

      {phase === 'artist-0' && (
        <div className="screen">
          <p className="eyebrow">{players[0].name}'s wheel — 2 of 2 ({players[0].genre.name})</p>
          <Wheel
            options={players[0].genre.artists}
            label="artist"
            onResult={(a) => updatePlayer(0, { artist: a })}
          />
          {players[0].artist && (
            <button className="btn btn-primary" onClick={() => setPhase('handoff-1')}>
              Lock in {players[0].artist}
            </button>
          )}
        </div>
      )}

      {phase === 'handoff-1' && (
        <PassDevice
          toPlayerLabel={players[1].name}
          subtitle="Time to spin your own genre & artist wheel."
          onReady={() => setPhase('genre-1')}
        />
      )}

      {phase === 'genre-1' && (
        <div className="screen">
          <p className="eyebrow">{players[1].name}'s wheel — 1 of 2</p>
          <Wheel
            options={GENRES}
            label="genre"
            onResult={(g) => updatePlayer(1, { genre: g })}
          />
          {players[1].genre && (
            <button className="btn btn-primary" onClick={() => setPhase('artist-1')}>
              Continue
            </button>
          )}
        </div>
      )}

      {phase === 'artist-1' && (
        <div className="screen">
          <p className="eyebrow">{players[1].name}'s wheel — 2 of 2 ({players[1].genre.name})</p>
          <Wheel
            options={players[1].genre.artists}
            label="artist"
            onResult={(a) => updatePlayer(1, { artist: a })}
          />
          {players[1].artist && (
            <button className="btn btn-primary" onClick={() => setPhase('handoff-start')}>
              Lock in {players[1].artist}
            </button>
          )}
        </div>
      )}

      {phase === 'handoff-start' && (
        <PassDevice
          toPlayerLabel="everyone"
          subtitle={`${players[0].name} is locked to ${players[0].artist}. ${players[1].name} is locked to ${players[1].artist}. 10 rounds, let's go.`}
          buttonLabel="Start game"
          onReady={beginGame}
        />
      )}

      {phase === 'prompt' && currentPrompt && (
        <div className="screen">
          <p className="eyebrow">
            Round {roundIndex + 1} of {TOTAL_ROUNDS}
          </p>
          <h2>{currentPrompt}</h2>
          <button className="btn btn-primary" onClick={goToSearch0}>
            Start round
          </button>
        </div>
      )}

      {phase === 'handoff-search-0' && (
        <PassDevice
          toPlayerLabel={players[0].name}
          subtitle={`Find a ${players[0].artist} song for: "${currentPrompt}"`}
          onReady={() => setPhase('search-0')}
        />
      )}
      {phase === 'search-0' && (
        <SongSearch
          player={players[0].name}
          lockedArtist={players[0].artist}
          prompt={currentPrompt}
          onSubmit={handleSubmit0}
          onForfeit={handleForfeit0}
        />
      )}

      {phase === 'handoff-search-1' && (
        <PassDevice
          toPlayerLabel={players[1].name}
          subtitle={`Find a ${players[1].artist} song for: "${currentPrompt}"`}
          onReady={() => setPhase('search-1')}
        />
      )}
      {phase === 'search-1' && (
        <SongSearch
          player={players[1].name}
          lockedArtist={players[1].artist}
          prompt={currentPrompt}
          onSubmit={handleSubmit1}
          onForfeit={handleForfeit1}
        />
      )}

      {phase === 'reveal' && (
        <RevealPlayback submissions={submissions} onDone={onRevealDone} />
      )}

      {phase === 'handoff-vote-0' && (
        <PassDevice
          toPlayerLabel={players[0].name}
          subtitle="Time to vote."
          onReady={() => setPhase('vote-0')}
        />
      )}
      {phase === 'vote-0' && (
        <VoteScreen voter={players[0].name} submissions={submissions} onVote={handleVote0} />
      )}

      {phase === 'handoff-vote-1' && (
        <PassDevice
          toPlayerLabel={players[1].name}
          subtitle="Time to vote."
          onReady={() => setPhase('vote-1')}
        />
      )}
      {phase === 'vote-1' && (
        <VoteScreen voter={players[1].name} submissions={submissions} onVote={handleVote1} />
      )}

      {phase === 'score' && roundResult && (
        <RoundScore
          result={roundResult}
          scores={scores}
          roundNumber={roundIndex + 1}
          totalRounds={TOTAL_ROUNDS}
          onContinue={nextRound}
        />
      )}

      {phase === 'end' && (
        <EndScreen scores={scores} history={history} onRestart={restart} />
      )}
    </div>
  )
}
