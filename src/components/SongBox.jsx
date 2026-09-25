// Shared song card used on the reveal, replay and voting screens, per [P2].
// hidePlayer: Blind Mode keeps submissions anonymous through playback and
// voting — the attribution line is suppressed even though playerName is
// still passed in, rather than stripping it out of the data layer.
export default function SongBox({ track, playerName, hidePlayer, playing, badge, onClick, disabled }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className={`song-box ${playing ? 'song-box-playing' : ''}`} onClick={onClick} disabled={disabled}>
      <div className="song-box-art" style={track.artwork ? { backgroundImage: `url(${track.artwork})` } : undefined} />
      {badge && <span className="song-box-badge">{badge}</span>}
      <div className="song-box-meta">
        <strong>{track.title}</strong>
        <span>{track.artist}</span>
        {playerName && !hidePlayer && <span className="hint">by {playerName}</span>}
      </div>
    </Tag>
  )
}
