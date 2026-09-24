// iTunes Search API wrapper — free, no auth. See "Song search & audio" in song-wars-build-spec.md.

function normalize(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

// A player's locked artist is treated as a match if either name contains the other
// once normalized (handles "Ed Sheeran" vs "Ed Sheeran feat. ..." style variants).
//
// v3 fix: iTunes' `artistName` field only ever reports the primary/lead artist —
// a featured artist never appears there. "Freaky Friday" by Lil Dicky ft. Chris
// Brown returns artistName: "Lil Dicky", so a player locked to Chris Brown was
// wrongly rejected even on the "Best feature" prompt that exists for exactly this
// case. Fallback: when the strict artist-name check fails, also check whether the
// locked artist's name appears in the track title, which is where iTunes puts
// "(feat. X)" / "ft. X" credits since it doesn't expose them as structured data.
export function artistMatches(trackArtistName, lockedArtist, trackTitle) {
  const a = normalize(trackArtistName)
  const b = normalize(lockedArtist)
  if (a && b && (a.includes(b) || b.includes(a))) return true

  if (trackTitle && b) {
    const title = normalize(trackTitle)
    if (title.includes(b)) return true
  }

  return false
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
    matchesLockedArtist: artistMatches(r.artistName, lockedArtist, r.trackName),
  }))

  results.sort((a, b) => {
    if (a.matchesLockedArtist !== b.matchesLockedArtist) {
      return a.matchesLockedArtist ? -1 : 1
    }
    return 0
  })

  return results
}
