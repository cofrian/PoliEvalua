-- Idiomas (fase 7.2): preferencia de cada persona e idioma por defecto del espacio.
-- profiles.locale nulo = seguir el idioma del navegador.
-- events.locale = idioma de la IA y de la votación pública; también el idioma
-- hablado por defecto en las grabaciones (Whisper usa «ca» para el valenciano).
alter table profiles
  add column if not exists locale text check (locale in ('es', 'ca', 'en'));

alter table events
  add column if not exists locale text not null default 'es' check (locale in ('es', 'ca', 'en'));
