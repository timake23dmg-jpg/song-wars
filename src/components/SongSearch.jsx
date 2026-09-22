import { useEffect, useRef, useState } from 'react'
import { searchSongs } from '../lib/itunes'
import Timer from './Timer'

// Round submission screen: search biased to the player's locked artist, preview
// before submitting, and a 60s timer that auto-forfeits the round on expiry.
export default function SongSearch({ player, lockedArtist, prompt, onSubmit, onForfeit }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const audioRef = useRef(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const r = await searchSongs(query, lockedArtist)
        setResults(r)
      } catch (e) {
        setError('Search failed — check your connection and try again.')
      } finally {
        setLoading(false)
      }
    }, 350)
    return () => clearTimeout(debounceRef.current)
  }, [query, lockedArtist])

  useEffect(() => {
    return () => audioRef.current?.pause()
  }, [])

  function pick(track) {
    audioRef.current?.pause()
    setSelected(track)
  }

  function submit() {
    if (!selected || !selected.previewUrl || submitted) return
    if (!selected.matchesLockedArtist) return // server-side artist check, simulated here
    setSubmitted(true)
    audioRef.current?.pause()
    onSubmit(selected)
  }

  return (
    <div className="screen song-search">
      <div className="search-header">
        <div>
          <p className="eyebrow">{player}'s pick · locked to {lockedArtist}</p>
          <h2>{prompt}</h2>
        </div>
        <Timer seconds={60} running={!submitted} onExpire={() => !submitted && onForfeit()} />
      </div>

      <input
        className="search-input"
        type="text"
        placeholder={`Search ${lockedArtist} songs…`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={submitted}
        autoFocus
      />

      {loading && <p className="hint">Searching…</p>}
      {error && <p className="error">{error}</p>}

      <ul className="results">
        {results.map((r) => (
          <li
            key={r.id}
            className={`result ${selected?.id === r.id ? 'result-selected' : ''}`}
            onClick={() => pick(r)}
          >
            {r.artwork && <img src={r.artwork} alt="" />}
            <div className="result-meta">
              <strong>{r.title}</strong>
              <span>{r.artist}</span>
            </div>
            {!r.matchesLockedArtist && (
              <span className="badge badge-warn">not {lockedArtist}</span>
            )}
          </li>
        ))}
      </ul>

      {selected && (
        <div className="selected-panel">
          <p>
            Selected: <strong>{selected.title}</strong> — {selected.artist}
          </p>
          {selected.previewUrl ? (
            <audio ref={audioRef} controls src={selected.previewUrl} />
          ) : (
            <p className="error">
              No preview clip available for this track — pick a different match.
            </p>
          )}
          {!selected.matchesLockedArtist && (
            <p className="error">
              This track isn't by {lockedArtist} — pick a song from your locked artist.
            </p>
          )}
          <button
            className="btn btn-primary"
            onClick={submit}
            disabled={submitted || !selected.previewUrl || !selected.matchesLockedArtist}
          >
            {submitted ? 'Submitted ✓' : 'Submit this song'}
          </button>
        </div>
      )}
    </div>
  )
}
