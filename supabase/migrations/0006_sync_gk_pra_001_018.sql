-- Sincronizzazione ufficiale GK-PRA-001 -> GK-PRA-018 da foglio "Sync App".
-- Aggiornamento conservativo: nessun INSERT in exercises e nessuna modifica a schema_url/foto_url.

alter table public.exercises add column if not exists schema_step_1 text;
alter table public.exercises add column if not exists schema_step_2 text;

-- La nuova fonte usa lo stesso nome di sottocategoria in fasi diverse.
alter table public.exercise_subcategories
  drop constraint if exists exercise_subcategories_category_id_nome_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.exercise_subcategories'::regclass
      and conname = 'exercise_subcategories_category_nome_fase_key'
  ) then
    alter table public.exercise_subcategories
      add constraint exercise_subcategories_category_nome_fase_key
      unique (category_id, nome, fase);
  end if;
end $$;

insert into public.exercise_subcategories (id, category_id, nome, fase, attivo) values
  (142, 1, 'Presa alta con intervento attivo', 'Analitico', true),
  (143, 1, 'Presa alta con intervento attivo', 'Disturbo', true),
  (144, 1, 'Presa bassa con intervento attivo', 'Disturbo', true)
on conflict (category_id, nome, fase) do update
set attivo = excluded.attivo, updated_at = now();

-- Arresta la migration se manca anche uno solo dei 18 record o se la categoria non è quella prevista.
do $$
declare
  missing_codes text;
begin
  with expected(codice) as (values ('GK-PRA-001'), ('GK-PRA-002'), ('GK-PRA-003'), ('GK-PRA-004'), ('GK-PRA-005'), ('GK-PRA-006'), ('GK-PRA-007'), ('GK-PRA-008'), ('GK-PRA-009'), ('GK-PRA-010'), ('GK-PRA-011'), ('GK-PRA-012'), ('GK-PRA-013'), ('GK-PRA-014'), ('GK-PRA-015'), ('GK-PRA-016'), ('GK-PRA-017'), ('GK-PRA-018'))
  select string_agg(expected.codice, ', ' order by expected.codice)
    into missing_codes
  from expected
  left join public.exercises e on e.codice = expected.codice and e.category_id = 1
  where e.id is null;

  if missing_codes is not null then
    raise exception 'Sincronizzazione annullata. Codici mancanti o fuori categoria: %', missing_codes;
  end if;

  if exists (
    with expected(codice) as (values ('GK-PRA-001'), ('GK-PRA-002'), ('GK-PRA-003'), ('GK-PRA-004'), ('GK-PRA-005'), ('GK-PRA-006'), ('GK-PRA-007'), ('GK-PRA-008'), ('GK-PRA-009'), ('GK-PRA-010'), ('GK-PRA-011'), ('GK-PRA-012'), ('GK-PRA-013'), ('GK-PRA-014'), ('GK-PRA-015'), ('GK-PRA-016'), ('GK-PRA-017'), ('GK-PRA-018'))
    select e.codice
    from public.exercises e join expected on expected.codice = e.codice
    group by e.codice having count(*) <> 1
  ) then
    raise exception 'Sincronizzazione annullata: rilevati codici duplicati.';
  end if;
end $$;

with official (
  codice, nome, sottocategoria, fase, durata_min, portieri_min, portieri_max,
  intensita, difficolta, materiale, obiettivo, variante, coaching_points,
  errori_comuni, schema_step_1, schema_step_2
) as (values
  ('GK-PRA-001', 'Presa alta frontale in posizione', 'Presa alta analitica', 'Analitico', 8, 1, 4, 'Bassa', 1, 'Palloni, coni', 'Migliorare tecnica di presa alta, lettura della traiettoria, posizionamento e sicurezza nella presa.', 'Variare lato, altezza e velocità del lancio mantenendo la corretta posizione di attesa.', 'Occhi sempre sulla palla; mani a coppa sopra la testa; pollici vicini; gomiti leggermente flessi; atterraggio in equilibrio.', 'Guardare il pallone tardi; mani non a coppa; gomiti larghi; presa instabile.', 'Lancio alto frontale del pallone da parte del preparatore.', 'Presa alta sopra la testa con entrambe le mani.'),
  ('GK-PRA-002', 'Presa alta con elevazione', 'Presa alta analitica', 'Analitico', 10, 1, 4, 'Media', 2, 'Palloni, coni', 'Migliorare elevazione, coordinazione e tecnica di presa alta nel punto più alto.', 'Variare altezza del lancio e gamba di stacco.', 'Attaccare il pallone; spinta decisa; braccia tese verso l''alto; presa sopra la testa; atterraggio equilibrato.', 'Stacco tardivo; presa troppo bassa; braccia piegate; atterraggio rigido.', 'Lancio alto frontale del pallone da parte del preparatore.', 'Elevazione e presa alta sopra la testa.'),
  ('GK-PRA-003', 'Presa alta con passaggio dell''allenatore', 'Presa alta con intervento attivo', 'Analitico', 10, 1, 4, 'Media', 2, 'Palloni, coni', 'Migliorare lettura della traiettoria e presa alta su servizio arcuato dell''allenatore.', 'Variare direzione, altezza e punto di partenza del servizio.', 'Posizione pronta; leggere subito il lancio; muovere i piedi prima della presa; mani sicure sul pallone.', 'Piedi fermi; lettura tardiva; presa davanti al viso; perdita di equilibrio.', 'Passaggio/lancio dell''allenatore verso il portiere.', 'Presa alta del portiere sulla traiettoria del pallone.'),
  ('GK-PRA-004', 'Presa alta in salto frontale', 'Presa alta analitica', 'Analitico', 10, 1, 2, 'Media', 2, 'Palloni, coni', 'Migliorare coordinazione e tecnica di presa alta in salto frontale.', 'Variare altezza e velocità del lancio; inserire un passo indietro prima del salto.', 'Occhi sul pallone; spinta decisa con le gambe; braccia distese; presa sopra la testa.', 'Guardare il pallone tardi; saltare con poca spinta; bloccare il pallone davanti al viso o al petto.', 'Lancio frontale del pallone da parte del preparatore.', 'Salto verso l''alto e presa alta del pallone sopra la testa.'),
  ('GK-PRA-005', 'Presa alta in tuffo laterale da lancio del preparatore', 'Presa alta con intervento attivo', 'Analitico', 10, 1, 2, 'Alta', 3, 'Palloni, coni', 'Migliorare coordinazione nel tuffo laterale e presa alta in sospensione.', 'Variare distanza e direzione del lancio; inserire un leggero rimbalzo prima del tuffo.', 'Spinta decisa con la gamba opposta; braccia tese; presa sopra la testa; pollici vicini; occhi sulla palla.', 'Spingere con la gamba sbagliata; estensione incompleta; mani morbide o presa davanti al viso.', 'Lancio del pallone dal preparatore lateralmente.', 'Tuffo laterale e presa alta con entrambe le mani.'),
  ('GK-PRA-006', 'Presa alta in tuffo frontale', 'Presa alta con intervento attivo', 'Analitico', 8, 1, 2, 'Alta', 3, 'Palloni, coni', 'Migliorare reattività, tecnica di presa alta e spinta in elevazione.', 'Variare distanza, potenza e direzione del lancio; alternare lanci tesi e lob.', 'Spinta esplosiva; braccia tese; occhi sul pallone; afferrare sopra la testa; atterrare in equilibrio.', 'Spinta insufficiente; lettura tardiva; braccia piegate; atterraggio sbilanciato.', 'Lancio frontale del pallone da parte del partner.', 'Tuffo frontale e presa alta del pallone con entrambe le mani.'),
  ('GK-PRA-007', 'Presa alta su palla arretrata', 'Presa alta con intervento attivo', 'Disturbo', 8, 1, 2, 'Alta', 3, 'Palloni, coni', 'Migliorare tempo di reazione, coordinazione e presa alta su lanci arretrati.', 'Variare traiettoria e altezza; alternare lanci tesi e lob.', 'Spinta decisa; braccia tese; presa sopra la testa; pollici vicini; occhi sempre sul pallone.', 'Partire in ritardo; spinta debole; braccia piegate; estensione incompleta.', 'Lancio della palla dal preparatore su traiettoria arretrata.', 'Spinta, salto e presa alta della palla sopra la testa.'),
  ('GK-PRA-008', 'Presa alta in uscita', 'Presa alta con intervento attivo', 'Disturbo', 8, 1, 1, 'Alta', 3, 'Palloni, coni', 'Migliorare la tempistica dell''uscita alta e la presa sicura del pallone in elevazione.', 'Variare profondità e traiettoria del lancio; inserire rimbalzi prima della presa.', 'Uscita decisa e veloce; braccia tese; presa sopra la testa; ginocchio in spinta; atterraggio equilibrato.', 'Uscire in ritardo; braccia piegate; occhi non fissi sul pallone; piedi disallineati in atterraggio.', 'Lancio alto e profondo del partner verso l''area.', 'Uscita in elevazione e presa alta del pallone con entrambe le mani.'),
  ('GK-PRA-009', 'Presa alta in uscita con ostacolo', 'Presa alta con intervento attivo', 'Disturbo', 10, 1, 1, 'Alta', 3, 'Palloni, coni, paletti o ostacoli', 'Migliorare l''uscita in elevazione superando un ostacolo e la presa alta del pallone.', 'Variare altezza e distanza del lancio; inserire più ostacoli; lancio da posizione laterale.', 'Spinta decisa; braccia tese; presa sopra la testa; ginocchio in spinta; atterraggio equilibrato.', 'Uscire in ritardo; non superare l''ostacolo; braccia piegate; elevazione insufficiente; atterraggio sbilanciato.', 'Lancio alto del pallone da parte del partner oltre l''ostacolo.', 'Uscita in elevazione superando l''ostacolo e presa alta con entrambe le mani.'),
  ('GK-PRA-010', 'Presa alta in tuffo laterale', 'Presa alta con intervento attivo', 'Disturbo', 8, 1, 2, 'Alta', 3, 'Palloni, coni', 'Migliorare copertura laterale in elevazione e presa alta del pallone in tuffo.', 'Variare altezza e direzione del lancio; alternare destra e sinistra.', 'Spinta esplosiva della gamba opposta; braccia tese; presa sopra la testa; atterraggio su spalla e fianco; occhi sul pallone.', 'Partire in ritardo; non coprire la distanza; piegare le braccia; guardare via dal pallone; atterrare con braccia tese.', 'Lancio alto e laterale del pallone da parte del partner.', 'Tuffo laterale con presa alta del pallone con entrambe le mani.'),
  ('GK-PRA-011', 'Presa alta in tuffo diagonale', 'Presa alta con intervento attivo', 'Disturbo', 8, 1, 2, 'Alta', 3, 'Palloni, coni', 'Migliorare l''intervento in elevazione con tuffo diagonale e presa alta in situazioni dinamiche.', 'Variare direzione e altezza del lancio; alternare lanci tesi e lob.', 'Spinta esplosiva della gamba opposta; braccia tese; corpo allungato sulla traiettoria; presa alta; atterraggio su spalla e fianco.', 'Partire tardi; non coprire la diagonale; piegare le braccia; perdere il pallone; atterrare su mani o gomito.', 'Lancio alto e diagonale del pallone da parte del partner.', 'Tuffo diagonale, estensione completa e presa alta con entrambe le mani.'),
  ('GK-PRA-012', 'Presa alta in tuffo in avanti', 'Presa alta con intervento attivo', 'Disturbo', 8, 1, 2, 'Alta', 3, 'Palloni, cono o ostacolo', 'Migliorare l''intervento in avanti in elevazione e la presa alta del pallone lontano dal corpo.', 'Variare distanza e altezza; inserire ostacolo basso da superare.', 'Spinta esplosiva; braccia tese; presa sopra la testa; corpo in estensione completa; atterraggio su petto e spalle.', 'Uscire in ritardo; non estendersi; piegare le braccia; portare il pallone verso il corpo; atterrare su gomiti o mani.', 'Lancio alto del pallone da parte del partner.', 'Tuffo in avanti e presa alta del pallone con entrambe le mani.'),
  ('GK-PRA-013', 'Presa alta in tuffo indietro', 'Presa alta con intervento attivo', 'Disturbo', 8, 1, 2, 'Alta', 3, 'Palloni, cono o ostacolo', 'Migliorare la presa alta in tuffo indietro gestendo coordinazione ed estensione del corpo.', 'Variare distanza e altezza; inserire ostacolo basso da superare.', 'Spinta esplosiva della gamba opposta; braccia tese; presa sopra la testa; arco del corpo; atterraggio su schiena e spalle.', 'Uscire in ritardo; estensione incompleta; braccia piegate; perdere il pallone dietro la testa; atterrare su gomiti o mani.', 'Lancio alto del pallone da parte del partner.', 'Tuffo indietro e presa alta del pallone con entrambe le mani.'),
  ('GK-PRA-014', 'Presa alta in tuffo a gomito', 'Presa alta con intervento attivo', 'Disturbo', 8, 1, 2, 'Alta', 3, 'Palloni, cono o ostacolo', 'Migliorare la tecnica di presa alta in tuffo con corretta chiusura a gomito, aumentando sicurezza e stabilità.', 'Variare direzione del lancio; aggiungere ostacolo basso; aumentare leggermente la velocità.', 'Spinta esplosiva; braccia tese; chiusura a gomito per bloccare; presa sopra la testa; corpo allungato; atterraggio su fianco o spalla.', 'Uscire in ritardo; non chiudere a gomito; piegare le braccia; lasciare spazio tra mani e pallone; atterrare su mani o gomiti.', 'Lancio alto del pallone da parte del partner.', 'Tuffo a gomito e presa alta del pallone con entrambe le mani.'),
  ('GK-PRA-015', 'Presa alta in tuffo a destra', 'Presa alta con intervento attivo', 'Disturbo', 8, 1, 2, 'Alta', 3, 'Palloni, cono o ostacolo', 'Migliorare l''intervento in elevazione verso destra con presa alta, coordinazione, estensione e sicurezza.', 'Variare distanza e altezza; inserire ostacolo basso; aumentare leggermente la velocità.', 'Spinta esplosiva della gamba opposta; braccia tese; presa sopra la testa; corpo allungato; atterraggio su fianco o spalla destra.', 'Uscire in ritardo; non spingere lateralmente; piegare le braccia; occhi non fissi; atterrare su mani o gomito.', 'Lancio alto del pallone da parte del partner.', 'Tuffo a destra e presa alta del pallone con entrambe le mani.'),
  ('GK-PRA-016', 'Presa alta in tuffo basso', 'Presa alta con intervento attivo', 'Disturbo', 8, 1, 2, 'Alta', 3, 'Palloni, cono o ostacolo', 'Allenare la presa alta del pallone in tuffo verso il basso, migliorando reattività, coordinazione e sicurezza.', 'Variare distanza e altezza; inserire ostacolo basso; aumentare leggermente la velocità.', 'Spinta esplosiva della gamba opposta; braccia tese; presa sopra la testa; corpo allungato verso il pallone; atterraggio su fianco o spalla.', 'Uscire in ritardo; piegare le braccia; occhi non fissi; atterrare su mani o gomito.', 'Lancio alto del pallone da parte del partner.', 'Tuffo basso e presa alta del pallone con entrambe le mani.'),
  ('GK-PRA-017', 'Presa alta in tuffo frontale', 'Presa alta con intervento attivo', 'Disturbo', 8, 1, 2, 'Alta', 3, 'Palloni, cono o ostacolo, sagoma', 'Migliorare la presa alta del pallone in tuffo frontale, curando reattività, coordinazione e sicurezza nell''intervento.', 'Variare l''altezza e la distanza del lancio. Inserire ostacolo basso da superare prima dell''intervento.', 'Spinta esplosiva in avanti; braccia tese verso il pallone; presa sopra la testa, pollici vicini; corpo allungato in estensione completa; atterraggio su petto e spalle.', 'Uscire in ritardo; non estendersi completamente; piegare le braccia in presa; perdere il pallone sopra la testa; atterrare su mani o gomiti.', 'Lancio alto del pallone da parte del partner.', 'Tuffo frontale, presa alta del pallone con entrambe le mani.'),
  ('GK-PRA-018', 'Presa bassa in tuffo frontale', 'Presa bassa con intervento attivo', 'Disturbo', 8, 1, 2, 'Alta', 3, 'Palloni, cono o ostacolo, sagoma', 'Migliorare la tecnica di presa bassa in tuffo frontale, aumentando reattività, coordinazione e sicurezza nell''intervento.', 'Variare la distanza e la velocità del passaggio. Inserire ostacolo basso da superare prima dell''intervento.', 'Partenza in posizione pronta; spinta esplosiva in avanti; mani aperte e dita rivolte verso il pallone; presa sicura con entrambe le mani; corpo dietro il pallone; atterraggio su petto e spalle.', 'Uscire in ritardo; piegare le braccia; occhi non fissi sul pallone; mani ravvicinate o rigide; atterrare su gomiti o mani.', 'Passaggio rasoterra da parte del partner.', 'Tuffo frontale basso, presa del pallone con entrambe le mani.')
)
update public.exercises e
set
  nome = o.nome,
  sottocategoria = o.sottocategoria,
  fase = o.fase,
  durata_min = o.durata_min,
  portieri_min = o.portieri_min,
  portieri_max = o.portieri_max,
  intensita = o.intensita,
  difficolta = o.difficolta,
  materiale = o.materiale,
  obiettivo = o.obiettivo,
  variante = o.variante,
  coaching_points = o.coaching_points,
  errori_comuni = o.errori_comuni,
  schema_step_1 = o.schema_step_1,
  schema_step_2 = o.schema_step_2,
  subcategory_id = s.id
from official o
join public.exercise_subcategories s
  on s.category_id = 1
 and s.nome = o.sottocategoria
 and s.fase = o.fase
where e.codice = o.codice
  and e.category_id = 1;

