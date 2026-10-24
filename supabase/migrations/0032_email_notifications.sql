-- Avisos por correo (fase 7.1): invitaciones, «te toca exponer» y resultados.
-- Cada persona puede desactivarlos en su perfil; el espacio decide con cuántos
-- minutos de antelación se avisa del turno (events.settings.notifications.turn_minutes).

alter table profiles
  add column if not exists email_notifications boolean not null default true;

-- Registro de envíos: evita mandar el mismo aviso dos veces (clave única).
create table if not exists email_log (
  key text primary key,
  event_id uuid references events(id) on delete cascade,
  kind text not null check (kind in ('invitation', 'turn', 'results')),
  recipients int not null default 0,
  sent_at timestamptz not null default now()
);

alter table email_log enable row level security;
-- Sin políticas: solo la clave de servicio (servidor) lee y escribe.

create or replace function turn_reminder_minutes(target_settings jsonb) returns int
language sql immutable as $$
  select least(60, greatest(1, coalesce((target_settings -> 'notifications' ->> 'turn_minutes')::int, 10)));
$$;

-- Turnos que entran en su ventana de aviso y aún no se han avisado.
create or replace function due_turn_reminders(max_rows int default 50)
returns table (slot_id uuid, event_id uuid, team_id uuid, starts_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.id, s.event_id, s.team_id, s.starts_at
  from presentation_slots s
  join events e on e.id = s.event_id
  where s.status = 'pending'
    and s.starts_at is not null
    and s.starts_at > now()
    and s.starts_at <= now() + make_interval(mins => turn_reminder_minutes(e.settings))
    and e.status <> 'closed'
    and not exists (select 1 from email_log l where l.key = 'turn:' || s.id || ':' || s.starts_at)
  limit max_rows;
$$;

-- Destinatarios con su correo de acceso: solo el servidor puede leerlos.
create or replace function notification_recipients(user_ids uuid[])
returns table (user_id uuid, email text, locale text)
language sql stable security definer set search_path = public as $$
  select u.id, u.email::text, p.locale
  from auth.users u
  join profiles p on p.id = u.id
  where u.id = any(user_ids)
    and p.email_notifications
    and not p.disabled
    and u.email is not null;
$$;

revoke all on function due_turn_reminders(int) from public, anon, authenticated;
revoke all on function notification_recipients(uuid[]) from public, anon, authenticated;
grant execute on function due_turn_reminders(int) to service_role;
grant execute on function notification_recipients(uuid[]) to service_role;

-- El pulso de la cola solo late si hay trabajos; ahora también si hay un turno
-- por avisar. Mismo destino y secreto que 0017.
select cron.unschedule('processing-jobs-tick')
where exists (select 1 from cron.job where jobname = 'processing-jobs-tick');

select cron.schedule(
  'processing-jobs-tick',
  '* * * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'jobs_tick_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'jobs_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'jobs_tick_url')
    and (
      exists (
        select 1 from processing_jobs
        where runner = 'internal' and status in ('queued', 'processing')
      )
      or exists (select 1 from public.due_turn_reminders(1))
    );
  $cron$
);
