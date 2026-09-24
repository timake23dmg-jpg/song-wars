-- Postgres doesn't automatically index foreign-key columns (only primary/
-- unique keys get that for free), and every query in this app filters by
-- game_code and often round_index too — without these, every submissions/
-- votes/players lookup is a sequential scan. Harmless at this app's current
-- scale, but cheap to fix now rather than as a surprise later.

create index if not exists idx_players_game_code on players(game_code);
create index if not exists idx_submissions_game_round on submissions(game_code, round_index);
create index if not exists idx_votes_game_round on votes(game_code, round_index);
