-- Fixes a real bug in 007: a joiner can't SELECT existing players rows to
-- compute their own next slot, because the players SELECT policy only
-- allows seeing players in a game you're ALREADY in — chicken-and-egg for
-- someone who hasn't inserted their own row yet. This RPC computes the next
-- slot and inserts the row atomically, server-side, bypassing that (it's
-- security definer, so it can see all players for the room), and re-checks
-- the max-players ceiling and "already joined" case itself rather than
-- relying on the client to have read anything first.

create or replace function join_game(p_code text, p_name text)
returns players
language plpgsql
security definer
as $$
declare
  v_slot int;
  v_max constant int := 16;
  v_player players;
begin
  if not exists (select 1 from games where code = p_code) then
    raise exception 'Room not found';
  end if;

  if exists (select 1 from players where game_code = p_code and user_id = auth.uid()) then
    raise exception 'You already joined this room from another tab';
  end if;

  select coalesce(max(slot) + 1, 0) into v_slot from players where game_code = p_code;

  if v_slot >= v_max then
    raise exception 'Room % is already full (max % players)', p_code, v_max;
  end if;

  insert into players (game_code, slot, name, user_id)
  values (p_code, v_slot, p_name, auth.uid())
  returning * into v_player;

  return v_player;
end;
$$;

grant execute on function join_game(text, text) to authenticated;
