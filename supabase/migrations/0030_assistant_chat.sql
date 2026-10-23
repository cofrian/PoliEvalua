-- Asistente con conversación (fase 7.4): cada mensaje pertenece a un hilo, puede
-- proponer distintas acciones y, si le falta información, pregunta en lugar de
-- inventar. Las acciones siempre esperan confirmación humana.
alter table assistant_proposals
  add column if not exists thread_id uuid,
  add column if not exists action text not null default 'evaluation'
    check (action in ('evaluation', 'groups', 'agenda', 'none')),
  add column if not exists questions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(questions) = 'array');

-- «info»: respuesta o preguntas sin nada que aplicar.
alter table assistant_proposals drop constraint if exists assistant_proposals_status_check;
alter table assistant_proposals
  add constraint assistant_proposals_status_check
  check (status in ('pending', 'applied', 'rejected', 'info'));

-- Los mensajes antiguos forman cada uno su propio hilo.
update assistant_proposals set thread_id = id where thread_id is null;
alter table assistant_proposals alter column thread_id set default gen_random_uuid();
alter table assistant_proposals alter column thread_id set not null;

create index if not exists assistant_proposals_thread_idx
  on assistant_proposals(event_id, user_id, thread_id, created_at);
