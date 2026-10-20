-- ========== PUNTUACIONES VÁLIDAS ==========
-- Cada puntuación debe ser de un criterio de la rúbrica de su evaluación y estar
-- dentro de la escala de esa rúbrica. Se comprueba en la base de datos porque el
-- formulario escribe directamente desde el cliente.
create or replace function check_evaluation_score() returns trigger
language plpgsql security definer set search_path = public as $$
declare r rubrics%rowtype;
begin
  select rb.* into r
  from evaluations e
  join rubrics rb on rb.id = e.rubric_id
  join rubric_criteria c on c.rubric_id = rb.id
  where e.id = new.evaluation_id and c.id = new.criterion_id;

  if not found then
    raise exception 'El criterio no pertenece a la rúbrica de esta evaluación.';
  end if;

  if new.score is not null and (new.score < r.scale_min or new.score > r.scale_max) then
    raise exception 'La puntuación % está fuera de la escala (% a %).', new.score, r.scale_min, r.scale_max;
  end if;

  return new;
end $$;

drop trigger if exists t_score_check on evaluation_scores;
create trigger t_score_check before insert or update on evaluation_scores
for each row execute function check_evaluation_score();

-- La escala también tiene que ser coherente.
alter table rubrics drop constraint if exists rubrics_scale_check;
alter table rubrics add constraint rubrics_scale_check check (scale_min >= 0 and scale_min < scale_max);

-- ========== RÚBRICA: SOLO EL ADMIN TOCA LA TABLA rubrics ==========
-- Los jueces siguen editando criterios y niveles mientras no esté bloqueada
-- (políticas rc_all y rl_all), pero no la escala, el nombre ni is_active.
-- La versión la sube bump_rubric_version(), que es security definer.
drop policy if exists r_upd on rubrics;

-- ========== ANTI FUERZA BRUTA ==========
-- Registro de intentos de acceso. Solo lo usa el servidor con la service role:
-- RLS activado y sin políticas, así que ningún cliente puede leerlo ni escribirlo.
create table if not exists auth_attempts (
  id bigserial primary key,
  key text not null,          -- 'ip:1.2.3.4' o 'email:ana@upv.es'
  kind text not null,         -- 'bad_code' | 'otp_sent' | 'bad_otp'
  created_at timestamptz not null default now()
);
create index if not exists auth_attempts_lookup on auth_attempts (key, kind, created_at desc);
alter table auth_attempts enable row level security;

-- Limpieza: no hace falta guardar intentos de más de un día.
create or replace function prune_auth_attempts() returns void
language sql security definer set search_path = public as $$
  delete from auth_attempts where created_at < now() - interval '1 day';
$$;
revoke execute on function prune_auth_attempts() from public, anon, authenticated;
grant execute on function prune_auth_attempts() to service_role;

-- Las cuentas solo las crea el servidor tras validar el código del evento.
-- Si alguien se registra por la API pública saltándose la app, su perfil
-- nace desactivado y no puede ver ni votar nada.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, role, disabled)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name',''),
          case when (new.raw_app_meta_data->>'make_admin')::boolean then 'admin'::user_role
               else 'judge'::user_role end,
          not coalesce((new.raw_app_meta_data->>'created_by_server')::boolean, false));
  return new;
end $$;
