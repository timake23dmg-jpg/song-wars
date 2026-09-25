-- v3: Theme Night. Host picks a theme id (see src/data/themes.js) alongside
-- mode/difficulty in the lobby; null = no theme (unrestricted genre/artist
-- pool, unaffected for every other mode).
alter table games add column if not exists theme text;
