-- Un panel desactivado no debe activar restricciones ni conceder voto.
create or replace function can_vote_team(target_event uuid, target_team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    can_vote_event(target_event)
    and exists(
      select 1 from teams t where t.id = target_team and t.event_id = target_event
    )
    and (
      has_event_role(target_event, array['owner','manager']::event_member_role[])
      or not exists(
        select 1
        from jury_panel_assignments a
        join jury_panels p
          on p.id = a.panel_id and p.event_id = a.event_id and p.active
        where a.event_id = target_event
          and a.round = coalesce(
            (select ep.current_round from evaluation_pages ep where ep.event_id = target_event),
            1
          )
      )
      or exists(
        select 1
        from jury_panel_assignments a
        join jury_panel_members m
          on m.panel_id = a.panel_id and m.event_id = a.event_id
        join jury_panels p
          on p.id = a.panel_id and p.event_id = a.event_id and p.active
        where a.event_id = target_event
          and a.team_id = target_team
          and a.round = coalesce(
            (select ep.current_round from evaluation_pages ep where ep.event_id = target_event),
            1
          )
          and m.user_id = auth.uid()
      )
    );
$$;
revoke execute on function can_vote_team(uuid, uuid) from public, anon;
grant execute on function can_vote_team(uuid, uuid) to authenticated;
