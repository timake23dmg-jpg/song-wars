-- v3 Phase 2: Points League becomes the one universal scoring format for
-- every headcount, replacing Best of 5 / Sudden Death / Double or Nothing
-- as the active flow (that code/schema stays in place, just unused).
--
-- The replay tracking (replay1_used/replay2_used) was hardcoded to exactly
-- 2 songs — generalizes to an array of which player slots have used their
-- one replay this round, for however many songs are actually in play.

alter table games add column if not exists replayed_slots int[] not null default '{}';
alter table games drop column if exists replay1_used;
alter table games drop column if exists replay2_used;

-- Total rounds for the current game's Points League match. Set once at game
-- start (drawn from ROUNDS in src/lib/pointsLeague.js) so every client
-- agrees on when the match ends without needing to hardcode it twice.
alter table games add column if not exists total_rounds int not null default 7;
