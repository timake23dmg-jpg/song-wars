-- Lets a client reveal a round's submissions once the 60s pick timer has
-- genuinely expired, even if only one (or zero) players submitted. Without
-- this, a forfeited round's lone submission would stay hidden forever (the
-- existing trigger only reveals once 2 rows exist), which would break the
-- round-score screen and the end-of-game recap for the non-submitting
-- player's client.
--
-- Security definer so it can bypass RLS for the update, but it independently
-- re-checks elapsed time server-side (not trusting the client's clock) and
-- that the caller is actually a player in this game, so it can't be abused
-- to peek at an opponent's pick before the timer is really up.
create or replace function reveal_expired_round(p_game_code text, p_round_index int)
returns void
language plpgsql
security definer
as $$
declare
  v_started timestamptz;
  v_is_member boolean;
begin
  select round_started_at into v_started from games where code = p_game_code;
  if v_started is null then
    return;
  end if;

  select exists(
    select 1 from players where game_code = p_game_code and user_id = auth.uid()
  ) into v_is_member;
  if not v_is_member then
    raise exception 'not a member of this game';
  end if;

  if now() < v_started + interval '60 seconds' then
    return; -- not actually expired yet — silent no-op, not an error
  end if;

  update submissions set revealed = true
  where game_code = p_game_code and round_index = p_round_index;
end;
$$;

grant execute on function reveal_expired_round(text, int) to authenticated;
