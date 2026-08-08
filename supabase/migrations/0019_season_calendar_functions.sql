-- Anteprima e generazione transazionale dell'agenda stagionale.

begin;

create or replace function public.preview_season_agenda(requested_season_id uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'giornate_vuote_rigenerabili', (select count(*) from calendar_days d where d.season_id = requested_season_id and d.origine in ('Generata','Eccezione') and not d.bloccata),
    'sedute_compilate_preservate', (select count(*) from trainings t where t.season_id = requested_season_id and t.content_status <> 'empty'),
    'gare_manuali_preservate', (select count(*) from matches m where m.season_id = requested_season_id and m.origine = 'Manuale'),
    'eccezioni_preservate', (select count(*) from calendar_exceptions e where e.season_id = requested_season_id)
  );
$$;

create or replace function public.generate_season_agenda(requested_season_id uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  current_season seasons%rowtype;
  generated_days integer := 0;
  created_sessions integer := 0;
begin
  select * into current_season from seasons where id = requested_season_id;
  if not found then raise exception 'Stagione non trovata'; end if;

  update matches set attiva = false
  where season_id = requested_season_id and origine = 'Generata' and not bloccata;

  insert into matches as target (season_id, data, tipo, origine, attiva, generation_key)
  select requested_season_id, candidate.match_date, 'Campionato', 'Generata', true, 'standard:' || candidate.match_date::text
  from (
    select day_value::date as match_date
    from season_phases phase
    cross join lateral generate_series(phase.data_inizio, phase.data_fine, interval '1 day') day_value
    where phase.season_id = requested_season_id and phase.tipo = 'Campionato'
      and phase.giorno_gara_standard is not null
      and extract(isodow from day_value)::smallint = phase.giorno_gara_standard
  ) candidate
  where not exists (
    select 1 from matches manual_match
    where manual_match.season_id = requested_season_id and manual_match.origine = 'Manuale' and manual_match.attiva
      and date_trunc('week', manual_match.data::timestamp) = date_trunc('week', candidate.match_date::timestamp)
  )
  on conflict (season_id, generation_key) do update set data = excluded.data, tipo = excluded.tipo, attiva = true, updated_at = now();

  with generated_dates as (
    select day_value::date as calendar_date from generate_series(current_season.data_inizio, current_season.data_fine, interval '1 day') day_value
  ), resolved as (
    select dates.calendar_date, phase.id as phase_id, phase.tipo as phase_type,
      phase.durata_standard_seduta, phase.possibilita_doppia_seduta,
      exception.id as exception_id, exception.tipo_giornata as exception_type,
      exact_match.id as exact_match_id, exact_match.tipo as exact_match_type,
      nearest_match.data as nearest_match_date,
      case when nearest_match.data is null then null else (dates.calendar_date - nearest_match.data)::smallint end as md_offset,
      exists (select 1 from season_recall_periods recall where recall.season_id = requested_season_id and recall.attivo and dates.calendar_date between recall.data_inizio and recall.data_fine) as recall_active,
      case
        when exception.id is not null then exception.tipo_giornata
        when exact_match.id is not null and exact_match.tipo = 'Amichevole' then 'Amichevole'
        when exact_match.id is not null then 'Gara'
        when phase.id is not null and extract(isodow from dates.calendar_date)::smallint = any(phase.giorni_standard_allenamento) then 'Allenamento'
        else 'Riposo'
      end as resolved_type,
      exception.durata_prevista as exception_duration, exception.carico_previsto as exception_load,
      exception.numero_portieri_previsti as exception_keepers, exception.note as exception_notes
    from generated_dates dates
    left join lateral (
      select p.* from season_phases p where p.season_id = requested_season_id and dates.calendar_date between p.data_inizio and p.data_fine
      order by case when p.tipo = 'Campionato' then 1 else 2 end limit 1
    ) phase on true
    left join calendar_exceptions exception on exception.season_id = requested_season_id and exception.data = dates.calendar_date
    left join lateral (
      select m.* from matches m where m.season_id = requested_season_id and m.attiva and m.data = dates.calendar_date
      order by case when m.origine = 'Manuale' then 1 else 2 end limit 1
    ) exact_match on true
    left join lateral (
      select m.data from matches m where m.season_id = requested_season_id and m.attiva
      order by abs(m.data - dates.calendar_date), case when m.data >= dates.calendar_date then 0 else 1 end limit 1
    ) nearest_match on true
  )
  insert into calendar_days as target (
    season_id, season_phase_id, data, tipo_giornata, match_id, training_profile_id, exception_id,
    richiamo_atletico, match_day_offset, durata_prevista, carico_previsto, numero_portieri_previsti,
    note, origine, bloccata, attiva
  )
  select requested_season_id, resolved.phase_id, resolved.calendar_date, resolved.resolved_type,
    resolved.exact_match_id, profile.id, resolved.exception_id, resolved.recall_active, resolved.md_offset,
    coalesce(resolved.exception_duration, profile.durata_standard, resolved.durata_standard_seduta),
    coalesce(resolved.exception_load, profile.carico_previsto),
    coalesce(resolved.exception_keepers, current_season.numero_portieri_standard), resolved.exception_notes,
    case when resolved.exception_id is not null then 'Eccezione' else 'Generata' end, false, true
  from resolved
  left join season_training_profiles profile on profile.season_id = requested_season_id and profile.match_day_offset = resolved.md_offset and profile.attivo
  on conflict (season_id, data) do update set
    season_phase_id = excluded.season_phase_id, tipo_giornata = excluded.tipo_giornata,
    match_id = excluded.match_id, training_profile_id = excluded.training_profile_id,
    exception_id = excluded.exception_id, richiamo_atletico = excluded.richiamo_atletico,
    match_day_offset = excluded.match_day_offset, durata_prevista = excluded.durata_prevista,
    carico_previsto = excluded.carico_previsto, numero_portieri_previsti = excluded.numero_portieri_previsti,
    note = excluded.note, origine = excluded.origine, attiva = true, updated_at = now()
  where target.origine in ('Generata','Eccezione') and not target.bloccata;

  get diagnostics generated_days = row_count;

  update trainings training set
    planned_duration_minutes = coalesce(day.durata_prevista, training.planned_duration_minutes),
    goalkeeper_count = coalesce(day.numero_portieri_previsti, training.goalkeeper_count),
    planned_load = day.carico_previsto, match_day_offset = day.match_day_offset,
    athletic_recall = day.richiamo_atletico, season_phase_id = day.season_phase_id,
    session_type = profile.tipo_seduta, status = case when day.tipo_giornata in ('Allenamento','Allenamento extra') then 'planned' else 'cancelled' end,
    updated_at = now()
  from calendar_days day left join season_training_profiles profile on profile.id = day.training_profile_id
  where training.calendar_day_id = day.id and training.generated_by_calendar and training.content_status = 'empty'
    and day.season_id = requested_season_id;

  insert into trainings (
    training_date, planned_duration_minutes, goalkeeper_count, notes, status, season_id,
    calendar_day_id, season_phase_id, session_number, session_type, planned_load,
    match_day_offset, athletic_recall, generated_by_calendar, content_status
  )
  select day.data, coalesce(day.durata_prevista, 60), coalesce(day.numero_portieri_previsti, current_season.numero_portieri_standard),
    day.note, 'planned', requested_season_id, day.id, day.season_phase_id, session_number,
    profile.tipo_seduta, day.carico_previsto, day.match_day_offset, day.richiamo_atletico, true, 'empty'
  from calendar_days day
  left join season_phases phase on phase.id = day.season_phase_id
  left join season_training_profiles profile on profile.id = day.training_profile_id
  cross join lateral generate_series(1, case when coalesce(phase.possibilita_doppia_seduta, false) then 2 else 1 end) session_number
  where day.season_id = requested_season_id and day.attiva and day.tipo_giornata in ('Allenamento','Allenamento extra')
  on conflict (calendar_day_id, session_number) where calendar_day_id is not null do nothing;

  get diagnostics created_sessions = row_count;

  return jsonb_build_object('giornate_generate_o_aggiornate', generated_days, 'sedute_vuote_create', created_sessions)
    || preview_season_agenda(requested_season_id);
end;
$$;

grant execute on function public.preview_season_agenda(uuid) to anon, authenticated;
grant execute on function public.generate_season_agenda(uuid) to anon, authenticated;

commit;

select 'MIGRATION 0019 COMPLETATA' as risultato;
