-- La tarea de cada minuto (processing-jobs-tick) llama a la URL guardada en el
-- vault. Se guardó con la dirección antigua de Vercel; pasa al dominio propio
-- para no depender de ese alias. Solo cambia si aún apunta a *.vercel.app, así
-- que no toca entornos locales ni una URL puesta a mano después.
do $$
declare
  current_secret record;
begin
  select id, decrypted_secret into current_secret
  from vault.decrypted_secrets
  where name = 'jobs_tick_url';

  if found and current_secret.decrypted_secret like '%.vercel.app%' then
    perform vault.update_secret(current_secret.id, 'https://polievalua.tech/api/jobs/tick');
  end if;
end $$;
