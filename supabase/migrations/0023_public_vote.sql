-- Voto del público: cualquiera con el enlace o el QR vota, sin cuenta, un voto
-- por dispositivo (puede cambiarlo mientras la votación esté abierta).
-- La app escribe con la clave de servicio tras comprobar que la votación está
-- abierta (events.settings.public_vote.open) y aplicar el límite por IP.

create table if not exists public_votes (
  event_id uuid not null references events(id) on delete cascade,
  voter_hash text not null check (length(voter_hash) = 64),
  team_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, voter_hash),
  foreign key (team_id, event_id) references teams(id, event_id) on delete cascade
);

create index if not exists public_votes_team_idx on public_votes (event_id, team_id);
create trigger t_public_votes before update on public_votes for each row execute function touch();

alter table public_votes enable row level security;

-- Solo la gestión consulta los votos; nadie escribe con su sesión.
create policy public_votes_select on public_votes for select using (can_manage_event(event_id));

grant select on public_votes to authenticated;
