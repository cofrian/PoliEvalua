-- La transcripción principal pasa de NVIDIA a Whisper en Groq.
alter table presentation_segments drop constraint if exists presentation_segments_provider_check;
alter table presentation_segments
  add constraint presentation_segments_provider_check
  check (provider is null or provider in ('groq', 'nvidia', 'external'));
