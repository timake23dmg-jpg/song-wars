// Shared song card used on the reveal, replay and voting screens, per [P2].
export default function SongBox({ track, playerName, playing, badge, onClick, disabled }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className={`song-box ${playing ? 'song-box-playing' : ''}`} onClick={onClick} disabled={disabled}>
      <div className="song-box-art" style={track.artwork ? { backgroundImage: `url(${track.artwork})` } : undefined} />
      {badge && <span className="song-box-badge">{badge}</span>}
      <div className="song-box-meta">
        <strong>{track.title}</strong>
        <span>{track.artist}</span>
        {playerName && <span className="hint">by {playerName}</span>}
      </div>
    </Tag>
  )
}
