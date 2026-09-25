-- v3: Elimination mode ("Last DJ Standing"). Everyone active submits/votes
-- each round; the lowest-voted player is eliminated. A tie for fewest votes
-- triggers a sudden-death mini-round scoped to just the tied players
-- (tiebreak_player_ids), repeating on further ties until exactly one player
-- is eliminated.

alter table players add column if not exists eliminated_at timestamptz;

-- Empty = normal round, every active (non-eliminated) player competes.
-- Non-empty = a tiebreak mini-round scoped to just these player ids.
alter table games add column if not exists tiebreak_player_ids uuid[] not null default '{}';

-- A player can eliminate themself (forfeit/leave) or be eliminated by the
-- outcome of a round — either way this only ever needs to SET the
-- timestamp, so "first write wins" isn't a real race to guard against (it's
-- idempotent: eliminating an already-eliminated player is a no-op change).
create or replace function eliminate_player(p_game_code text, p_player_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  if not exists (
    select 1 from players where game_code = p_game_code and user_id = auth.uid()
  ) then
    raise exception 'not a member of this game';
  end if;

  update players set eliminated_at = now()
  where id = p_player_id and game_code = p_game_code and eliminated_at is null;
end;
$$;

grant execute on function eliminate_player(text, uuid) to authenticated;
