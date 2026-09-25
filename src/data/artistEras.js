// v3 Theme Night: the decade each artist in the curated pool (src/data/genres.js)
// broke out in or is most associated with, for era-based themes ("90s Night",
// etc). Kept as a separate flat lookup rather than restructuring genres.js
// itself, so nothing about the existing wheel/artist-lock flow has to change
// shape — this is purely additive data used only by src/lib/theme.js.
//
// Note: with only ~5 artists per genre today, an early-decade theme (70s/90s)
// will have a thin pool until the separate content-expansion effort grows it —
// same tradeoff the difficulty-levels doc already calls out for Easy mode.
export const ARTIST_ERAS = {
  // Pop
  'Taylor Swift': '2010s',
  'Ariana Grande': '2010s',
  'Bruno Mars': '2010s',
  'Dua Lipa': '2020s',
  'Ed Sheeran': '2010s',
  // Hip-Hop/Rap
  Drake: '2010s',
  'Kendrick Lamar': '2010s',
  Future: '2010s',
  'Kanye West': '2000s',
  'J. Cole': '2010s',
  // R&B
  SZA: '2020s',
  'The Weeknd': '2010s',
  'Chris Brown': '2000s',
  Beyoncé: '2000s',
  Usher: '2000s',
  // Rock
  Coldplay: '2000s',
  'Imagine Dragons': '2010s',
  'Foo Fighters': '1990s',
  'Red Hot Chili Peppers': '1990s',
  'Linkin Park': '2000s',
  // Afrobeats
  'Burna Boy': '2020s',
  Wizkid: '2010s',
  Davido: '2010s',
  Rema: '2020s',
  Tems: '2020s',
  // Latin/Reggaeton
  'Bad Bunny': '2020s',
  'J Balvin': '2010s',
  'Karol G': '2020s',
  Ozuna: '2010s',
  'Daddy Yankee': '2000s',
  // Dancehall/Reggae
  'Sean Paul': '2000s',
  Shaggy: '2000s',
  'Vybz Kartel': '2010s',
  Popcaan: '2010s',
  'Bob Marley': '1970s',
  // Country
  'Morgan Wallen': '2020s',
  'Luke Combs': '2020s',
  'Chris Stapleton': '2010s',
  'Kacey Musgraves': '2010s',
  'Carrie Underwood': '2000s',
  // Electronic/Dance
  'Calvin Harris': '2010s',
  'David Guetta': '2010s',
  Marshmello: '2010s',
  Avicii: '2010s',
  Kygo: '2010s',
  // Alternative/Indie
  'Tame Impala': '2010s',
  'The 1975': '2010s',
  'Arctic Monkeys': '2000s',
  'Glass Animals': '2020s',
  'Billie Eilish': '2020s',
  // Soul/Funk
  'Stevie Wonder': '1970s',
  'Earth Wind & Fire': '1970s',
  'Anderson .Paak': '2010s',
  'Erykah Badu': '1990s',
  'Marvin Gaye': '1970s',
  // K-Pop
  BTS: '2010s',
  BLACKPINK: '2010s',
  'Stray Kids': '2020s',
  TWICE: '2010s',
  NewJeans: '2020s',
}

export const ERAS = ['1970s', '1990s', '2000s', '2010s', '2020s']
