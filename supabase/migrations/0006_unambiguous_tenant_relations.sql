-- Las claves compuestas sustituyen a las relaciones simples originales.
-- Mantener ambas hace ambiguas las expansiones de PostgREST. Se conserva el
-- comportamiento ON DELETE CASCADE y se añade la igualdad de event_id.

alter table teams drop constraint teams_challenge_same_event;
alter table team_members drop constraint team_members_team_same_event;
alter table notes drop constraint notes_team_same_event;
alter table rubric_criteria drop constraint rubric_criteria_rubric_same_event;
alter table rubric_levels drop constraint rubric_levels_criterion_same_event;
alter table evaluations drop constraint evaluations_team_same_event;
alter table evaluations drop constraint evaluations_rubric_same_event;
alter table evaluation_scores drop constraint evaluation_scores_evaluation_same_event;
alter table evaluation_scores drop constraint evaluation_scores_criterion_same_event;
alter table rubric_changes drop constraint rubric_changes_rubric_same_event;

alter table teams drop constraint teams_challenge_id_fkey;
alter table team_members drop constraint team_members_team_id_fkey;
alter table notes drop constraint notes_team_id_fkey;
alter table rubric_criteria drop constraint rubric_criteria_rubric_id_fkey;
alter table rubric_levels drop constraint rubric_levels_criterion_id_fkey;
alter table evaluations drop constraint evaluations_team_id_fkey;
alter table evaluations drop constraint evaluations_rubric_id_fkey;
alter table evaluation_scores drop constraint evaluation_scores_evaluation_id_fkey;
alter table evaluation_scores drop constraint evaluation_scores_criterion_id_fkey;
alter table rubric_changes drop constraint rubric_changes_rubric_id_fkey;

alter table teams add constraint teams_challenge_same_event
  foreign key (challenge_id, event_id) references challenges(id, event_id) on delete cascade;
alter table team_members add constraint team_members_team_same_event
  foreign key (team_id, event_id) references teams(id, event_id) on delete cascade;
alter table notes add constraint notes_team_same_event
  foreign key (team_id, event_id) references teams(id, event_id) on delete cascade;
alter table rubric_criteria add constraint rubric_criteria_rubric_same_event
  foreign key (rubric_id, event_id) references rubrics(id, event_id) on delete cascade;
alter table rubric_levels add constraint rubric_levels_criterion_same_event
  foreign key (criterion_id, event_id) references rubric_criteria(id, event_id) on delete cascade;
alter table evaluations add constraint evaluations_team_same_event
  foreign key (team_id, event_id) references teams(id, event_id) on delete cascade;
alter table evaluations add constraint evaluations_rubric_same_event
  foreign key (rubric_id, event_id) references rubrics(id, event_id) on delete cascade;
alter table evaluation_scores add constraint evaluation_scores_evaluation_same_event
  foreign key (evaluation_id, event_id) references evaluations(id, event_id) on delete cascade;
alter table evaluation_scores add constraint evaluation_scores_criterion_same_event
  foreign key (criterion_id, event_id) references rubric_criteria(id, event_id) on delete cascade;
alter table rubric_changes add constraint rubric_changes_rubric_same_event
  foreign key (rubric_id, event_id) references rubrics(id, event_id) on delete cascade;

notify pgrst, 'reload schema';
