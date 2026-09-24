import { useState } from 'react'
import Timer from './Timer'
import SongBox from './SongBox'

// One player's vote. Self-voting is allowed by default — see the "Self-voting"
// open decision in the spec; with only 2 players, disallowing it removes any
// signal from the vote (each player would always vote for the other by default,
// resolving to a permanent tie), so this build defaults to allowed. Flag if you'd
// rather forbid it.
export default function VoteScreen({ voter, submissions, onVote }) {
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

      <div className="song-box-row">
        {submissions.map((s, idx) => (
          <SongBox key={idx} track={s.track} playerName={s.player} onClick={() => vote(idx)} disabled={cast} />
        ))}
      </div>

      {cast && <p className="hint">Vote locked in ✓</p>}
    </div>
  )
}
