-- El asistente también puede proponer cambios de ajustes del menú de gestión
-- (grabaciones, inscripción, resultados, votación pública, códigos…). Como
-- las demás acciones, solo se aplican cuando la persona las confirma.
alter table assistant_proposals drop constraint if exists assistant_proposals_action_check;
alter table assistant_proposals
  add constraint assistant_proposals_action_check
  check (action in ('evaluation', 'groups', 'agenda', 'settings', 'none'));
