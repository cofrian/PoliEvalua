-- Informe de puntos débiles para el jurado, organizado por criterio de la rúbrica.
alter table presentation_jury_reports
  add column if not exists weaknesses jsonb not null default '[]'::jsonb
    check (jsonb_typeof(weaknesses) = 'array');
