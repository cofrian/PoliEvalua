do $$
declare
  event_id constant uuid := '00000000-0000-4000-8000-000000000001';
  challenge_1_id constant uuid := '00000000-0000-4000-8000-000000000101';
  challenge_2_id constant uuid := '00000000-0000-4000-8000-000000000102';
  rubric_id constant uuid := '00000000-0000-4000-8000-000000000201';
  criterion_1_id constant uuid := '00000000-0000-4000-8000-000000000301';
  criterion_2_id constant uuid := '00000000-0000-4000-8000-000000000302';
  criterion_3_id constant uuid := '00000000-0000-4000-8000-000000000303';
  criterion_4_id constant uuid := '00000000-0000-4000-8000-000000000304';
  criterion_5_id constant uuid := '00000000-0000-4000-8000-000000000305';
begin
  if exists (select 1 from events where id = event_id) then
    raise notice 'El seed de València Hack ya está aplicado; no se modifican los datos existentes.';
    return;
  end if;

  insert into events (id, name, date, status, signup_code, signup_open)
  values (event_id, 'València Hack', '2026-10-15', 'building', 'VLCHACK26', true);

  insert into challenges (id, event_id, name, description, "order")
  values
    (challenge_1_id, event_id, 'Reto 1', null, 1),
    (challenge_2_id, event_id, 'Reto 2', null, 2);

  insert into rubrics (id, event_id, name, is_active, locked, scale_min, scale_max)
  values (rubric_id, event_id, 'Rúbrica Sigma Data Club', true, false, 1, 5);

  insert into rubric_criteria (id, rubric_id, title, description, weight, "order")
  values
    (criterion_1_id, rubric_id, 'Impacto ciudadano / valor de la propuesta', null, 25, 1),
    (criterion_2_id, rubric_id, 'Innovación y creatividad', null, 20, 2),
    (criterion_3_id, rubric_id, 'Solidez técnica / implantación en el Ayuntamiento', null, 25, 3),
    (criterion_4_id, rubric_id, 'Viabilidad económica', null, 20, 4),
    (criterion_5_id, rubric_id, 'Comunicación / defensa de la propuesta', null, 10, 5);

  insert into rubric_levels (criterion_id, score, label, descriptor)
  values
    (criterion_1_id, 1, 'Muy insuficiente', 'La propuesta no identifica un problema ciudadano concreto ni explica qué valor aportaría. Los beneficios son inexistentes, irrelevantes o no están justificados.'),
    (criterion_1_id, 2, 'Insuficiente', 'Identifica una necesidad de forma superficial, pero el beneficio para la ciudadanía es poco claro, limitado o difícil de demostrar.'),
    (criterion_1_id, 3, 'Adecuado', 'Responde a una necesidad reconocible y aporta un beneficio razonable, aunque la magnitud del impacto o las personas beneficiarias están descritas de forma general.'),
    (criterion_1_id, 4, 'Muy bueno', 'Aporta una mejora clara y relevante para la ciudadanía, con beneficiarios definidos y una explicación convincente de los resultados esperados.'),
    (criterion_1_id, 5, 'Excelente', 'Aborda una necesidad prioritaria con una propuesta de gran valor público. Define claramente a quién beneficia y presenta resultados esperados concretos y plausibles, idealmente medibles.'),
    (criterion_2_id, 1, 'Muy insuficiente', 'La propuesta reproduce soluciones habituales sin adaptación relevante y no aporta un enfoque novedoso para el problema planteado.'),
    (criterion_2_id, 2, 'Insuficiente', 'Incluye algún elemento diferente, pero la innovación es menor, poco desarrollada o no queda claro qué mejora respecto a lo existente.'),
    (criterion_2_id, 3, 'Adecuado', 'Presenta una idea útil con algunos elementos originales o una adaptación pertinente de soluciones conocidas.'),
    (criterion_2_id, 4, 'Muy bueno', 'Combina ideas o tecnologías de forma creativa y ofrece una mejora diferenciadora respecto a las alternativas habituales.'),
    (criterion_2_id, 5, 'Excelente', 'Presenta un enfoque claramente diferencial, original y bien razonado, con potencial para abrir nuevas posibilidades o mejorar sustancialmente las soluciones existentes.'),
    (criterion_3_id, 1, 'Muy insuficiente', 'La solución carece de una explicación técnica suficiente o presenta obstáculos fundamentales. No justifica cómo podría implantarse en el Ayuntamiento de València ni considera requisitos básicos, datos, integración o mantenimiento.'),
    (criterion_3_id, 2, 'Insuficiente', 'Describe la solución de forma parcial, con dudas importantes sobre su funcionamiento, los recursos necesarios o su encaje en los sistemas y procesos municipales.'),
    (criterion_3_id, 3, 'Adecuado', 'La solución es técnicamente plausible a nivel general. Identifica los principales requisitos y una vía inicial de implantación, aunque quedan aspectos relevantes por concretar.'),
    (criterion_3_id, 4, 'Muy bueno', 'Explica con claridad cómo funcionaría y cómo podría integrarse en el contexto municipal. Considera los datos, sistemas, recursos, seguridad y mantenimiento más relevantes, con riesgos abordables.'),
    (criterion_3_id, 5, 'Excelente', 'Presenta una solución técnicamente sólida y bien aterrizada en el Ayuntamiento de València, con arquitectura o proceso comprensible, requisitos identificados, integración viable, riesgos y mantenimiento previstos, y un plan de implantación convincente.'),
    (criterion_4_id, 1, 'Muy insuficiente', 'No presenta un presupuesto o justificación económica suficiente, o las cifras son incoherentes con el alcance de la propuesta y una posible implantación municipal.'),
    (criterion_4_id, 2, 'Insuficiente', 'Incluye una estimación muy incompleta o poco fundamentada. Omite costes relevantes o no explica cómo se sostendría la solución en el tiempo.'),
    (criterion_4_id, 3, 'Adecuado', 'Presenta una estimación inicial razonable, aunque algunos costes, supuestos o necesidades de continuidad están poco detallados.'),
    (criterion_4_id, 4, 'Muy bueno', 'Justifica los principales costes y recursos, con supuestos razonables y una relación clara entre inversión y beneficios esperados.'),
    (criterion_4_id, 5, 'Excelente', 'Presenta una estimación coherente, transparente y bien fundamentada, que contempla implantación, operación y mantenimiento, y demuestra una relación coste-beneficio convincente.'),
    (criterion_5_id, 1, 'Muy insuficiente', 'La exposición resulta difícil de seguir; no explica con claridad el problema, la solución o su valor. No responde de forma pertinente a las preguntas.'),
    (criterion_5_id, 2, 'Insuficiente', 'Comunica las ideas principales de forma irregular, con lagunas importantes o argumentos poco claros. La defensa responde solo parcialmente a las preguntas.'),
    (criterion_5_id, 3, 'Adecuado', 'Expone el problema y la solución de manera comprensible. La argumentación es suficiente, aunque podría ser más estructurada, concreta o convincente.'),
    (criterion_5_id, 4, 'Muy bueno', 'Presenta una defensa clara, ordenada y convincente, utiliza bien el tiempo y responde con solvencia a las preguntas.'),
    (criterion_5_id, 5, 'Excelente', 'Comunica de forma excelente y adaptada al público: exposición precisa, estructurada y persuasiva, con argumentos sólidos y respuestas claras, honestas y bien fundamentadas.');

  insert into teams (id, challenge_id, number, name)
  values
    ('10000000-0000-4000-8000-000000000001', challenge_1_id, 1, 'Chupi pandi'),
    ('10000000-0000-4000-8000-000000000002', challenge_1_id, 2, 'Patos de Tarde'),
    ('10000000-0000-4000-8000-000000000003', challenge_1_id, 3, 'Cena'),
    ('10000000-0000-4000-8000-000000000004', challenge_1_id, 4, 'Myazo'),
    ('10000000-0000-4000-8000-000000000005', challenge_1_id, 5, 'gatITonas'),
    ('10000000-0000-4000-8000-000000000006', challenge_1_id, 6, 'SIGMA-DZY'),
    ('10000000-0000-4000-8000-000000000007', challenge_1_id, 7, 'DataStorm'),
    ('10000000-0000-4000-8000-000000000008', challenge_1_id, 8, 'Marina & Aya (sin nombre)'),
    ('10000000-0000-4000-8000-000000000009', challenge_1_id, 9, 'Nirmin & Carla (sin nombre)'),
    ('10000000-0000-4000-8000-000000000010', challenge_1_id, 10, 'winsortf'),
    ('20000000-0000-4000-8000-000000000001', challenge_2_id, 1, 'Inter de Python'),
    ('20000000-0000-4000-8000-000000000002', challenge_2_id, 2, 'Aporreadores de hardware'),
    ('20000000-0000-4000-8000-000000000003', challenge_2_id, 3, 'Liras'),
    ('20000000-0000-4000-8000-000000000004', challenge_2_id, 4, 'ONU'),
    ('20000000-0000-4000-8000-000000000005', challenge_2_id, 5, 'ferrero.split()'),
    ('20000000-0000-4000-8000-000000000006', challenge_2_id, 6, 'ValenciaTec'),
    ('20000000-0000-4000-8000-000000000007', challenge_2_id, 7, 'InvtRomán26'),
    ('20000000-0000-4000-8000-000000000008', challenge_2_id, 8, 'Cafeter.IA'),
    ('20000000-0000-4000-8000-000000000009', challenge_2_id, 9, 'AI Destroyers'),
    ('20000000-0000-4000-8000-000000000010', challenge_2_id, 10, 'X');

  insert into team_members (team_id, full_name)
  values
    ('10000000-0000-4000-8000-000000000001', 'Carlota Gui'),
    ('10000000-0000-4000-8000-000000000001', 'María Fátima Cebrià'),
    ('10000000-0000-4000-8000-000000000001', 'Adriana Baghdasaryan Hovantanyan'),
    ('10000000-0000-4000-8000-000000000001', 'Javier Baena Martín'),
    ('10000000-0000-4000-8000-000000000002', 'Vicente Llácer Llorca'),
    ('10000000-0000-4000-8000-000000000002', 'Mateo Alis Fidel'),
    ('10000000-0000-4000-8000-000000000002', 'Pablo Huguet Chordi'),
    ('10000000-0000-4000-8000-000000000002', 'Manuel Caballero Vicente'),
    ('10000000-0000-4000-8000-000000000003', 'Pedro Díaz-Masa Valencia'),
    ('10000000-0000-4000-8000-000000000003', 'Pablo Zarzo Montés'),
    ('10000000-0000-4000-8000-000000000003', 'Emma Torres Aranda'),
    ('10000000-0000-4000-8000-000000000003', 'Alicia Samland Mena'),
    ('10000000-0000-4000-8000-000000000004', 'Adrián Sabater Perales'),
    ('10000000-0000-4000-8000-000000000004', 'Gabriel Borrás Roger'),
    ('10000000-0000-4000-8000-000000000004', 'Fabricio Cabrera Tisalema'),
    ('10000000-0000-4000-8000-000000000004', 'Bautista Dahn Costante'),
    ('10000000-0000-4000-8000-000000000005', 'María Belén Marca Ábalos'),
    ('10000000-0000-4000-8000-000000000005', 'Andrea Quintanilla Torrez'),
    ('10000000-0000-4000-8000-000000000005', 'Ainhoa García Herrera'),
    ('10000000-0000-4000-8000-000000000005', 'Luis Roberto Quintanilla Torrez'),
    ('10000000-0000-4000-8000-000000000006', 'Giomara Alexandra Dioses Pagán'),
    ('10000000-0000-4000-8000-000000000006', 'Younes'),
    ('10000000-0000-4000-8000-000000000006', 'Charlize'),
    ('10000000-0000-4000-8000-000000000006', 'Javier Gadea Guerrero'),
    ('10000000-0000-4000-8000-000000000007', 'Diego García García'),
    ('10000000-0000-4000-8000-000000000007', 'Dídac Aliaga Codina'),
    ('10000000-0000-4000-8000-000000000007', 'Eduardo Maciá Navío'),
    ('10000000-0000-4000-8000-000000000008', 'Marina Clouet Escribano'),
    ('10000000-0000-4000-8000-000000000008', 'Aya El Bouazzaoui Haddari'),
    ('10000000-0000-4000-8000-000000000008', 'David Alexandru Toma Pricop'),
    ('10000000-0000-4000-8000-000000000008', 'Pau Romeu Ferrás'),
    ('10000000-0000-4000-8000-000000000009', 'Nirmin Azhaf Labrass'),
    ('10000000-0000-4000-8000-000000000009', 'Carla Villanueva'),
    ('10000000-0000-4000-8000-000000000009', 'Ismael Doniz'),
    ('10000000-0000-4000-8000-000000000010', 'Jose Ospina'),
    ('10000000-0000-4000-8000-000000000010', 'Cristian Ospina'),
    ('10000000-0000-4000-8000-000000000010', 'Zhenze Xue Jiang'),
    ('10000000-0000-4000-8000-000000000010', 'Maksym'),
    ('20000000-0000-4000-8000-000000000001', 'David Sancho Carrascosa'),
    ('20000000-0000-4000-8000-000000000001', 'Samuel García Sesé'),
    ('20000000-0000-4000-8000-000000000001', 'Raúl Gradolí Montagud'),
    ('20000000-0000-4000-8000-000000000001', 'Marcos Gramaje Pelufo'),
    ('20000000-0000-4000-8000-000000000002', 'Dani Vidal Penadés'),
    ('20000000-0000-4000-8000-000000000002', 'Javier Higuera Carrillo'),
    ('20000000-0000-4000-8000-000000000002', 'Nicolás Roig Meseguer'),
    ('20000000-0000-4000-8000-000000000002', 'Javier Beltrán Argente'),
    ('20000000-0000-4000-8000-000000000003', 'Alex Ripoll'),
    ('20000000-0000-4000-8000-000000000003', 'Irene Cayuelas'),
    ('20000000-0000-4000-8000-000000000003', 'Pau Ruiz'),
    ('20000000-0000-4000-8000-000000000003', 'Manuel Montalvo'),
    ('20000000-0000-4000-8000-000000000004', 'Nora Aitikhlef Attaoui'),
    ('20000000-0000-4000-8000-000000000004', 'Marta Gregori Bataller'),
    ('20000000-0000-4000-8000-000000000004', 'Anyu-Jhon Zhu'),
    ('20000000-0000-4000-8000-000000000004', 'Jorge Jiménez'),
    ('20000000-0000-4000-8000-000000000005', 'Miriam Domenech Gracia'),
    ('20000000-0000-4000-8000-000000000005', 'Nerea Valera del Puerto'),
    ('20000000-0000-4000-8000-000000000005', 'Vega Montalbán Mengod'),
    ('20000000-0000-4000-8000-000000000005', 'Claudia Ruiz García'),
    ('20000000-0000-4000-8000-000000000006', 'Iker Urzaiz Donlo'),
    ('20000000-0000-4000-8000-000000000006', 'Pablo Pellicer'),
    ('20000000-0000-4000-8000-000000000006', 'Arturo Lorenzo'),
    ('20000000-0000-4000-8000-000000000006', 'Juan (por confirmar)'),
    ('20000000-0000-4000-8000-000000000007', 'Christian Bernardos Vilariño'),
    ('20000000-0000-4000-8000-000000000007', 'Ignacio Noguerales Vela'),
    ('20000000-0000-4000-8000-000000000007', 'Gabriel Zamora Fernández'),
    ('20000000-0000-4000-8000-000000000008', 'Elena Escriche'),
    ('20000000-0000-4000-8000-000000000008', 'Danielle Saxon'),
    ('20000000-0000-4000-8000-000000000008', 'Julia Sánchez Manrique'),
    ('20000000-0000-4000-8000-000000000009', 'Claudiu Iosia Rus'),
    ('20000000-0000-4000-8000-000000000009', 'Jordi Sarrió Sanfélix'),
    ('20000000-0000-4000-8000-000000000009', 'Samuel Parry Rebollo'),
    ('20000000-0000-4000-8000-000000000009', 'Ferran Tuixans Canalda'),
    ('20000000-0000-4000-8000-000000000010', 'Hugo Andreu'),
    ('20000000-0000-4000-8000-000000000010', 'Álex Cabanes Corbí'),
    ('20000000-0000-4000-8000-000000000010', 'Vladyslav Taratunskyi'),
    ('20000000-0000-4000-8000-000000000010', 'Daniel Torres Bursik');

  insert into sponsors (id, name, logo_light_url, logo_dark_url, url, "order")
  values
    ('00000000-0000-4000-8000-000000000501', 'Cátedra Valent-IA', null, null, null, 1),
    ('00000000-0000-4000-8000-000000000502', 'Sigma Data Club', '/brand/sponsors/sigma-light.svg', '/brand/sponsors/sigma-dark.svg', null, 2),
    ('00000000-0000-4000-8000-000000000503', 'ETSINF', '/brand/sponsors/etsinf.svg', '/brand/sponsors/etsinf.svg', null, 3),
    ('00000000-0000-4000-8000-000000000504', 'UPV', '/brand/sponsors/upv-vee.jpg', '/brand/sponsors/upv-vee.jpg', null, 4),
    ('00000000-0000-4000-8000-000000000505', 'Ajuntament de València', '/brand/sponsors/ajuntament-color.svg', '/brand/sponsors/ajuntament-neg.svg', null, 5),
    ('00000000-0000-4000-8000-000000000506', 'Generación Espontánea', '/brand/sponsors/generacion-espontanea.png', '/brand/sponsors/generacion-espontanea.png', null, 6),
    ('00000000-0000-4000-8000-000000000507', 'VEE', null, null, null, 7)
  on conflict (id) do nothing;
end
$$;
