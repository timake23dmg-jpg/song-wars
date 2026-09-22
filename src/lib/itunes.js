// iTunes Search API wrapper — free, no auth. See "Song search & audio" in song-wars-build-spec.md.

function normalize(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

// A player's locked artist is treated as a match if either name contains the other
// once normalized (handles "Ed Sheeran" vs "Ed Sheeran feat. ..." style variants).
export function artistMatches(trackArtistName, lockedArtist) {
  const a = normalize(trackArtistName)
  const b = normalize(lockedArtist)
  if (!a || !b) return false
  return a.includes(b) || b.includes(a)
}

// Bias search results toward the locked artist by folding it into the query,
// then re-sort so exact/near artist matches float to the top.
export async function searchSongs(query, lockedArtist) {
  const term = query.trim() ? `${lockedArtist} ${query}` : lockedArtist
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(
    term
  )}&entity=song&limit=25`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`iTunes search failed: ${res.status}`)
  const data = await res.json()

  const results = (data.results || []).map((r) => ({
    id: r.trackId,
    title: r.trackName,
    artist: r.artistName,
    artwork: r.artworkUrl100,
    previewUrl: r.previewUrl || null,
    matchesLockedArtist: artistMatches(r.artistName, lockedArtist),
  }))

  results.sort((a, b) => {
    if (a.matchesLockedArtist !== b.matchesLockedArtist) {
      return a.matchesLockedArtist ? -1 : 1
    }
    return 0
  })

  return results
}
