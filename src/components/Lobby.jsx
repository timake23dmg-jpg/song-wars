import { useState } from 'react'
import { hostGame, joinGame } from '../lib/room'

// Entry point for real two-device play: host a room and get a 4-character
// code, or join one someone shared with you. Replaces the old single-device
// "pass and play" name-entry screen.
export default function Lobby({ onJoined }) {
  const [mode, setMode] = useState('choose') // choose | host | join
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function submitHost(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { code, player } = await hostGame(name.trim())
      onJoined({ code, player, slot: 0 })
    } catch (err) {
      setError(err.message || 'Could not create a room.')
    } finally {
      setBusy(false)
    }
  }

  async function submitJoin(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { code: joinedCode, player } = await joinGame(code, name.trim())
      onJoined({ code: joinedCode, player, slot: 1 })
    } catch (err) {
      setError(err.message || 'Could not join that room.')
    } finally {
      setBusy(false)
    }
  }

  if (mode === 'choose') {
    return (
      <div className="screen">
        <h2>Song Wars</h2>
        <p className="hint">Host a game and share the code, or join a friend's.</p>
        <button className="btn btn-primary" onClick={() => setMode('host')}>
          Host a game
        </button>
        <button className="btn" onClick={() => setMode('join')}>
          Join with a code
        </button>
      </div>
    )
  }

  if (mode === 'host') {
    return (
      <form className="screen" onSubmit={submitHost}>
        <h2>Host a game</h2>
        <label>
          Your name
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Creating room…' : 'Create room'}
        </button>
        <button className="btn" type="button" onClick={() => setMode('choose')} disabled={busy}>
          Back
        </button>
      </form>
    )
  }

  return (
    <form className="screen" onSubmit={submitJoin}>
      <h2>Join a game</h2>
      <label>
        Room code
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={4}
          placeholder="7XQ2"
          required
          autoFocus
          style={{ textTransform: 'uppercase', letterSpacing: '0.2em', textAlign: 'center' }}
        />
      </label>
      <label>
        Your name
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? 'Joining…' : 'Join room'}
      </button>
      <button className="btn" type="button" onClick={() => setMode('choose')} disabled={busy}>
        Back
      </button>
    </form>
  )
}
