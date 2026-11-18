-- Cada reto decide cómo se puntúa:
--   general       → solo la rúbrica general del espacio (como hasta ahora).
--   general_plus  → rúbrica general + criterios propios del reto, mezclados
--                   con general_weight % para la general y el resto para el reto.
--   own           → solo los criterios propios del reto.
-- Los criterios propios viven en una rúbrica aparte (is_active = false) enlazada
-- desde challenges.rubric_id. El jurado evalúa al grupo una sola vez: hay una
-- fila de evaluations por rúbrica, como permite la clave (team, judge, rubric).
alter table challenges
  add column if not exists scoring_mode text not null default 'general',
  add column if not exists general_weight int not null default 60,
  add column if not exists rubric_id uuid;

alter table challenges drop constraint if exists challenges_scoring_mode_check;
alter table challenges add constraint challenges_scoring_mode_check
  check (scoring_mode in ('general', 'general_plus', 'own'));

alter table challenges drop constraint if exists challenges_general_weight_check;
alter table challenges add constraint challenges_general_weight_check
  check (general_weight between 0 and 100);

alter table challenges drop constraint if exists challenges_rubric_same_event;
alter table challenges add constraint challenges_rubric_same_event
  foreign key (rubric_id, event_id) references rubrics(id, event_id) on delete set null (rubric_id);

-- Marca la rúbrica como propia de un reto (para no confundirla con la general).
alter table rubrics add column if not exists challenge_id uuid references challenges(id) on delete cascade;
create unique index if not exists rubrics_challenge_unique on rubrics (challenge_id) where challenge_id is not null;
