-- Voto del público con la rúbrica: además del modo «favorito» (public_votes),
-- el público puede puntuar cada proyecto con los criterios de la rúbrica activa.
-- Mismo modelo que public_votes: sin cuenta, un dispositivo = una huella, y
-- solo escribe el servidor con la clave de servicio.

create table if not exists public_scores (
  event_id uuid not null references events(id) on delete cascade,
  voter_hash text not null check (length(voter_hash) = 64),
  team_id uuid not null,
  criterion_id uuid not null references rubric_criteria(id) on delete cascade,
  score numeric(6,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, voter_hash, team_id, criterion_id),
  foreign key (team_id, event_id) references teams(id, event_id) on delete cascade
);

create index if not exists public_scores_team_idx on public_scores (event_id, team_id);
create trigger t_public_scores before update on public_scores for each row execute function touch();

alter table public_scores enable row level security;

-- Solo la gestión consulta las puntuaciones; nadie escribe con su sesión.
create policy public_scores_select on public_scores for select using (can_manage_event(event_id));

grant select on public_scores to authenticated;
