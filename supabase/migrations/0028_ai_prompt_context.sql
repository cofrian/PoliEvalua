-- Trazabilidad de los prompts y pista de vocabulario para Whisper.
alter table presentation_recordings
  add column if not exists asr_prompt text check (char_length(asr_prompt) <= 700),
  add column if not exists prompt_version text,
  add column if not exists analysis_meta jsonb not null default '{}'::jsonb
    check (jsonb_typeof(analysis_meta) = 'object');

alter table presentation_jury_reports
  add column if not exists prompt_version text;
