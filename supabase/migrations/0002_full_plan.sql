-- ========== MODO AUDITORÍA ==========
-- El admin solo ve notas privadas ajenas si activa el modo auditoría.
alter table events add column if not exists audit_mode boolean not null default false;

create or replace function audit_mode() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from events where audit_mode);
$$;

drop policy if exists n_sel on notes;
create policy n_sel on notes for select using (
  is_active_user() and (author_id = auth.uid() or is_shared or (is_admin() and audit_mode())));

-- ========== RÚBRICA ==========
alter table rubrics add column if not exists version int not null default 1;

-- Los pesos de los criterios vivos deben sumar 100 para poder bloquear la rúbrica.
create or replace function check_rubric_weights() returns trigger
language plpgsql as $$
declare total numeric;
begin
  if new.locked and not coalesce(old.locked, false) then
    select coalesce(sum(weight), 0) into total
    from rubric_criteria where rubric_id = new.id and deleted_at is null;
    if total <> 100 then
      raise exception 'Los pesos suman % %%; deben sumar 100 %% para bloquear la rúbrica.', total;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists t_rubric_weights on rubrics;
create trigger t_rubric_weights before update on rubrics
for each row execute function check_rubric_weights();

-- Cada cambio en criterios o niveles sube la versión de la rúbrica.
create or replace function bump_rubric_version() returns trigger
language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  if tg_table_name = 'rubric_criteria' then
    rid := coalesce(new.rubric_id, old.rubric_id);
  else
    select rubric_id into rid from rubric_criteria
    where id = coalesce(new.criterion_id, old.criterion_id);
  end if;
  update rubrics set version = version + 1, updated_at = now(), updated_by = auth.uid()
  where id = rid;
  return coalesce(new, old);
end $$;

drop trigger if exists t_crit_version on rubric_criteria;
create trigger t_crit_version after insert or update or delete on rubric_criteria
for each row execute function bump_rubric_version();
drop trigger if exists t_level_version on rubric_levels;
create trigger t_level_version after insert or update or delete on rubric_levels
for each row execute function bump_rubric_version();

-- ========== PATROCINADORES ==========
alter table sponsors add column if not exists display_height int not null default 40;
alter table sponsors add column if not exists aspect_ratio numeric(5,2) not null default 3;
alter table sponsors add column if not exists dark_background boolean not null default true;

-- ========== PERFILES ==========
-- Para la presencia y el panel admin.
create or replace function touch_last_seen() returns void
language sql security definer set search_path = public as $$
  update profiles set last_seen_at = now() where id = auth.uid();
$$;

-- ========== REALTIME ==========
do $$ begin
  alter publication supabase_realtime add table teams, team_members, events, rubric_changes;
exception when duplicate_object then null; end $$;

-- Logos ya equilibrados (misma superficie visual) para el pie de la pantalla de acceso.
update sponsors set logo_light_url = '/brand/sponsors/sigma-light.svg', logo_dark_url = '/brand/sponsors/sigma-dark.svg',
  display_height = 38, aspect_ratio = 3.08, dark_background = false, "order" = 1 where name = 'Sigma Data Club';
update sponsors set logo_light_url = '/brand/sponsors/etsinf.svg', logo_dark_url = '/brand/sponsors/etsinf.svg',
  display_height = 36, aspect_ratio = 4.35, dark_background = true, "order" = 2 where name = 'ETSINF';
update sponsors set logo_light_url = '/brand/sponsors/ajuntament-color-crop.svg', logo_dark_url = '/brand/sponsors/ajuntament-color-crop.svg',
  display_height = 48, aspect_ratio = 3.22, dark_background = true, "order" = 3 where name = 'Ajuntament de València';
update sponsors set logo_light_url = '/brand/sponsors/generacion-espontanea-crop.png', logo_dark_url = '/brand/sponsors/generacion-espontanea-crop.png',
  display_height = 48, aspect_ratio = 2.44, dark_background = true, "order" = 4 where name = 'Generación Espontánea';
update sponsors set name = 'UPV · Vicerrectorado de Estudiantes y Emprendimiento',
  logo_light_url = '/brand/sponsors/upv-vee.jpg', logo_dark_url = '/brand/sponsors/upv-vee.jpg',
  display_height = 54, aspect_ratio = 1.75, dark_background = false, "order" = 5 where name = 'UPV';
-- Sin logo propio: el de VEE ya va incluido en el de la UPV.
delete from sponsors where name = 'VEE' and logo_light_url is null;
