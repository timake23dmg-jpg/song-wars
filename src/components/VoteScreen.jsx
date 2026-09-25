import { useState } from 'react'
import Timer from './Timer'
import SongBox from './SongBox'

// One player's vote, for however many candidates are in this round (v3:
// any number of players, not just 2). Self-voting is allowed by default —
// see the "Self-voting" open decision in the original spec.
export default function VoteScreen({ voter, submissions, hidePlayer, onVote }) {
  const [cast, setCast] = useState(false)

  function vote(idx) {
    if (cast) return
    setCast(true)
    onVote(idx)
  }

  function expire() {
    if (cast) return
    setCast(true)
    onVote(null) // missed vote = no vote cast, not an automatic loss
  }

  return (
    <div className="screen vote-screen">
      <div className="search-header">
        <h2>{voter}, vote for the best song</h2>
        <Timer seconds={15} running={!cast} onExpire={expire} />
      </div>

      <div className="song-box-grid">
        {submissions.map((s, idx) => (
          <SongBox
            key={idx}
            track={s.track}
            playerName={s.player}
            hidePlayer={hidePlayer}
            onClick={() => vote(idx)}
            disabled={cast}
          />
        ))}
      </div>

      {cast && <p className="hint">Vote locked in ✓</p>}
    </div>
  )
}
