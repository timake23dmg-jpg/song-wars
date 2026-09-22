alter table games drop constraint if exists games_status_check;
alter table games add constraint games_status_check
  check (status in ('lobby', 'wheel', 'playing', 'finished'));
