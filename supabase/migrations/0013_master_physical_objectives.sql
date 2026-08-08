-- FASE B — UPSERT dei 52 obiettivi fisici dal MASTER ufficiale.
-- Ripetibile: usa codice UNIQUE, non elimina record e non crea duplicati.

begin;

do $phase_b_prerequisites$
begin
  if to_regclass('public.physical_objectives') is null then
    raise exception 'FASE B annullata: la tabella physical_objectives non esiste.';
  end if;
end
$phase_b_prerequisites$;

insert into public.physical_objectives as target (
  codice,
  macro_area,
  obiettivo_fisico,
  descrizione,
  priorita_portiere,
  precampionato,
  periodo_competitivo,
  richiamo_mantenimento,
  recupero_rigenerazione,
  abbinamenti_tecnici,
  note_programmazione,
  attivo
)
values
  ('FIS-001', 'Forza', 'Forza generale', 'Sviluppo della capacità di produrre forza globale con schemi motori fondamentali.', 'Alta', 'Alta', 'Media', 'Media', 'Bassa', 'Tecnica generale; prese; tuffi; uscite', 'Base strutturale soprattutto nel precampionato.', true),
  ('FIS-002', 'Forza', 'Forza arti inferiori', 'Incremento della capacità di produrre forza con anche, ginocchia e caviglie.', 'Molto alta', 'Alta', 'Media', 'Alta', 'Bassa', 'Tuffi; uscite; spostamenti; 1 contro 1', 'Fondamentale per spinte, arresti e ripartenze.', true),
  ('FIS-003', 'Forza', 'Forza arti superiori', 'Sviluppo della forza di spalle, braccia e cintura scapolare.', 'Alta', 'Alta', 'Media', 'Media', 'Bassa', 'Prese; respinte; rialzate; gioco con le mani', 'Curare controllo scapolare e qualità del gesto.', true),
  ('FIS-004', 'Forza', 'Forza del core', 'Sviluppo della capacità del tronco di trasmettere e controllare le forze.', 'Molto alta', 'Alta', 'Alta', 'Alta', 'Media', 'Tutte le categorie tecniche', 'Trasversale a quasi ogni gesto del portiere.', true),
  ('FIS-005', 'Forza', 'Forza massima', 'Incremento della massima forza esprimibile nei principali pattern di movimento.', 'Alta', 'Molto alta', 'Bassa', 'Media', 'Bassa', 'Tuffi; uscite; esplosività', 'Da programmare con recuperi elevati e tecnica esecutiva rigorosa.', true),
  ('FIS-006', 'Forza', 'Forza monopodalica', 'Sviluppo della forza su un singolo arto e riduzione delle asimmetrie.', 'Molto alta', 'Alta', 'Media', 'Alta', 'Media', 'Spinta laterale; tuffi; uscite; cambi direzione', 'Particolarmente specifica per le spinte del portiere.', true),
  ('FIS-007', 'Forza', 'Forza eccentrica', 'Capacità di assorbire e controllare elevate tensioni durante frenate e atterraggi.', 'Molto alta', 'Alta', 'Media', 'Alta', 'Media', 'Atterraggi; cambi direzione; tuffi', 'Utile anche in ottica preventiva.', true),
  ('FIS-008', 'Potenza', 'Potenza arti inferiori', 'Produzione rapida di elevati livelli di forza con gli arti inferiori.', 'Molto alta', 'Alta', 'Alta', 'Alta', 'Bassa', 'Tuffi; uscite alte; 1 contro 1', 'Obiettivo centrale nella prestazione del portiere.', true),
  ('FIS-009', 'Potenza', 'Potenza arti superiori', 'Produzione rapida di forza con arti superiori e cintura scapolare.', 'Alta', 'Alta', 'Media', 'Media', 'Bassa', 'Respinte; rilanci; rialzate', 'Integrare con stabilità scapolare.', true),
  ('FIS-010', 'Potenza', 'Potenza globale', 'Espressione esplosiva coordinata di arti inferiori, tronco e arti superiori.', 'Molto alta', 'Alta', 'Alta', 'Alta', 'Bassa', 'Tuffi; uscite; rilanci; sequenze combinate', 'Preferire gesti multiarticolari e specifici.', true),
  ('FIS-011', 'Esplosività', 'Spinta verticale', 'Capacità di produrre rapidamente forza verso l''alto.', 'Molto alta', 'Alta', 'Alta', 'Alta', 'Bassa', 'Presa alta; uscite alte; palle aeree', 'Specifico per elevazione e intercetto.', true),
  ('FIS-012', 'Esplosività', 'Spinta orizzontale', 'Capacità di accelerare rapidamente in avanti o indietro.', 'Alta', 'Alta', 'Alta', 'Alta', 'Bassa', 'Uscite basse; 1 contro 1; profondità', 'Usare distanze brevi e alta qualità.', true),
  ('FIS-013', 'Esplosività', 'Spinta laterale', 'Capacità di generare rapidamente forza verso destra e sinistra.', 'Molto alta', 'Alta', 'Alta', 'Alta', 'Bassa', 'Tuffo basso; tuffo alto; deviazioni laterali', 'Uno degli obiettivi fisici più specifici per il ruolo.', true),
  ('FIS-014', 'Esplosività', 'Esplosività monopodalica', 'Produzione rapida di forza a partire da un singolo arto.', 'Molto alta', 'Alta', 'Alta', 'Alta', 'Bassa', 'Tuffi; uscite; cambi direzione', 'Controllare qualità e simmetria destra/sinistra.', true),
  ('FIS-015', 'Velocità', 'Accelerazione breve', 'Raggiungimento rapido di elevata velocità nei primi metri.', 'Alta', 'Alta', 'Alta', 'Alta', 'Bassa', 'Uscite; profondità; 1 contro 1', 'Distanze brevi e recuperi completi.', true),
  ('FIS-016', 'Velocità', 'Velocità di spostamento', 'Rapidità negli spostamenti specifici all''interno e davanti alla porta.', 'Molto alta', 'Alta', 'Alta', 'Alta', 'Bassa', 'Posizionamento; uscite; tuffi', 'Privilegiare spostamenti specifici del portiere.', true),
  ('FIS-017', 'Velocità', 'Rapidità piedi', 'Frequenza e precisione dei piccoli appoggi necessari al posizionamento.', 'Molto alta', 'Media', 'Alta', 'Alta', 'Bassa', 'Posizione; tuffi; prese; reattività', 'Evitare lavori fini a sé stessi senza trasferimento tecnico.', true),
  ('FIS-018', 'Agilità', 'Cambio di direzione', 'Capacità di frenare e ripartire rapidamente in una nuova direzione.', 'Molto alta', 'Alta', 'Alta', 'Alta', 'Bassa', 'Tuffi; 1 contro 1; spostamenti', 'Associare tecnica di frenata e controllo del baricentro.', true),
  ('FIS-019', 'Agilità', 'Arresto e ripartenza', 'Capacità di decelerare, stabilizzarsi e accelerare nuovamente.', 'Molto alta', 'Alta', 'Alta', 'Alta', 'Bassa', 'Posizionamento; doppio intervento; uscite', 'Molto utile nelle sequenze di seconda palla.', true),
  ('FIS-020', 'Agilità', 'Spostamenti multidirezionali', 'Capacità di muoversi efficacemente su più piani e direzioni.', 'Molto alta', 'Alta', 'Alta', 'Alta', 'Bassa', 'Tutte le situazioni dinamiche', 'Integrare stimoli imprevedibili.', true),
  ('FIS-021', 'Reattività', 'Reazione a stimolo visivo', 'Riduzione del tempo tra percezione visiva e risposta motoria.', 'Molto alta', 'Media', 'Alta', 'Alta', 'Bassa', 'Tiri; deviazioni; 1 contro 1', 'Stimoli coerenti con informazioni di gioco.', true),
  ('FIS-022', 'Reattività', 'Reazione a stimolo sonoro', 'Risposta motoria rapida a un segnale acustico.', 'Media', 'Media', 'Media', 'Media', 'Bassa', 'Esercizi coordinativi e reattivi', 'Utile come variante, meno specifico dello stimolo visivo.', true),
  ('FIS-023', 'Reattività', 'Reazione multidirezionale', 'Risposta rapida a stimoli che richiedono direzioni differenti.', 'Molto alta', 'Media', 'Alta', 'Alta', 'Bassa', 'Tuffi; doppio intervento; deviazioni', 'Elevata specificità se associata alla lettura della palla.', true),
  ('FIS-024', 'Reattività', 'Reazione + accelerazione', 'Trasformazione immediata dello stimolo in un''accelerazione breve.', 'Molto alta', 'Media', 'Alta', 'Alta', 'Bassa', 'Uscite; profondità; seconda palla', 'Mantenere brevi i tempi di lavoro.', true),
  ('FIS-025', 'Pliometria', 'Pliometria verticale', 'Uso rapido del ciclo stiramento-accorciamento in direzione verticale.', 'Alta', 'Alta', 'Media', 'Media', 'Bassa', 'Uscite alte; presa alta', 'Dosare attentamente volume e impatti.', true),
  ('FIS-026', 'Pliometria', 'Pliometria orizzontale', 'Uso esplosivo del ciclo stiramento-accorciamento sul piano orizzontale.', 'Alta', 'Alta', 'Media', 'Media', 'Bassa', 'Uscite; tuffi in avanzamento', 'Curare atterraggio e controllo.', true),
  ('FIS-027', 'Pliometria', 'Pliometria laterale', 'Produzione reattiva di forza sul piano laterale.', 'Molto alta', 'Alta', 'Media', 'Alta', 'Bassa', 'Tuffi laterali; cambi direzione', 'Molto specifica, soprattutto monopodalica.', true),
  ('FIS-028', 'Pliometria', 'Ciclo stiramento-accorciamento', 'Capacità di assorbire e restituire rapidamente energia elastica.', 'Alta', 'Alta', 'Media', 'Media', 'Bassa', 'Tuffi; salti; cambi direzione', 'La qualità del contatto è più importante del volume.', true),
  ('FIS-029', 'Coordinazione', 'Coordinazione generale', 'Organizzazione efficace di movimenti complessi e segmenti corporei.', 'Alta', 'Alta', 'Media', 'Media', 'Media', 'Tecnica generale', 'Utile nelle fasi iniziali e nei richiami.', true),
  ('FIS-030', 'Coordinazione', 'Coordinazione arti superiori/inferiori', 'Sincronizzazione efficace tra appoggi, tronco e azione delle braccia.', 'Molto alta', 'Alta', 'Alta', 'Alta', 'Media', 'Prese; tuffi; uscite', 'Elevato trasferimento sul gesto tecnico.', true),
  ('FIS-031', 'Coordinazione', 'Coordinazione occhio-mano', 'Coordinazione della risposta manuale rispetto alla traiettoria visiva della palla.', 'Molto alta', 'Media', 'Alta', 'Alta', 'Media', 'Prese; deviazioni; palle aeree', 'Integrabile direttamente nel lavoro tecnico.', true),
  ('FIS-032', 'Coordinazione', 'Orientamento spazio-temporale', 'Capacità di percepire posizione, distanze, tempi e traiettorie.', 'Molto alta', 'Media', 'Alta', 'Alta', 'Media', 'Uscite; cross; profondità; posizionamento', 'Preferire compiti contestualizzati.', true),
  ('FIS-033', 'Stabilità', 'Stabilità del core', 'Controllo del tronco durante gesti statici e dinamici.', 'Molto alta', 'Alta', 'Alta', 'Alta', 'Alta', 'Tutte le categorie', 'Utilizzabile anche nei giorni a carico ridotto.', true),
  ('FIS-034', 'Stabilità', 'Stabilità monopodalica', 'Controllo posturale su un singolo arto.', 'Alta', 'Alta', 'Media', 'Alta', 'Alta', 'Spinte; atterraggi; cambi direzione', 'Integrare progressivamente perturbazioni e movimento.', true),
  ('FIS-035', 'Stabilità', 'Controllo dinamico', 'Capacità di mantenere controllo articolare e posturale durante il movimento.', 'Molto alta', 'Alta', 'Alta', 'Alta', 'Alta', 'Tuffi; uscite; cambi direzione', 'Ponte tra prevenzione e prestazione.', true),
  ('FIS-036', 'Stabilità', 'Controllo dell''atterraggio', 'Capacità di assorbire e stabilizzare correttamente l''atterraggio.', 'Molto alta', 'Alta', 'Alta', 'Alta', 'Alta', 'Uscite alte; tuffi; pliometria', 'Prioritario prima di aumentare intensità pliometrica.', true),
  ('FIS-037', 'Mobilità', 'Mobilità anca', 'Mantenimento di adeguati range articolari dell''anca.', 'Alta', 'Alta', 'Media', 'Alta', 'Molto alta', 'Posizione bassa; tuffi; 1 contro 1', 'Utile in attivazione e recupero.', true),
  ('FIS-038', 'Mobilità', 'Mobilità caviglia', 'Mantenimento della dorsiflessione e libertà di movimento della caviglia.', 'Alta', 'Alta', 'Media', 'Alta', 'Molto alta', 'Spostamenti; accosciate; salti; atterraggi', 'Importante per appoggi e frenate.', true),
  ('FIS-039', 'Mobilità', 'Mobilità spalla', 'Mantenimento della mobilità funzionale della cintura scapolo-omerale.', 'Alta', 'Alta', 'Media', 'Alta', 'Molto alta', 'Prese alte; respinte; rilanci', 'Evitare mobilità passiva eccessiva senza controllo.', true),
  ('FIS-040', 'Mobilità', 'Mobilità toracica', 'Mantenimento della mobilità toracica in rotazione ed estensione.', 'Media', 'Alta', 'Media', 'Alta', 'Molto alta', 'Tuffi; prese alte; rilanci', 'Supporta funzione della spalla e del tronco.', true),
  ('FIS-041', 'Prevenzione', 'Prevenzione adduttori', 'Capacità degli adduttori di tollerare carichi e controllare movimenti laterali.', 'Molto alta', 'Alta', 'Alta', 'Alta', 'Alta', 'Tuffi; spostamenti laterali; 1 contro 1', 'Inserire con continuità durante tutta la stagione.', true),
  ('FIS-042', 'Prevenzione', 'Prevenzione posteriori coscia', 'Forza e controllo della catena posteriore.', 'Alta', 'Alta', 'Alta', 'Alta', 'Alta', 'Accelerazioni; uscite; recuperi', 'Integrare lavoro eccentrico progressivo.', true),
  ('FIS-043', 'Prevenzione', 'Prevenzione ginocchio', 'Controllo dell''arto inferiore e tolleranza ai carichi sul ginocchio.', 'Alta', 'Alta', 'Alta', 'Alta', 'Alta', 'Salti; atterraggi; cambi direzione', 'Controllare allineamento e gestione dei carichi.', true),
  ('FIS-044', 'Prevenzione', 'Prevenzione caviglia', 'Sviluppo di forza, propriocezione e controllo della caviglia.', 'Alta', 'Alta', 'Alta', 'Alta', 'Alta', 'Spostamenti; salti; atterraggi', 'Utile come routine breve e frequente.', true),
  ('FIS-045', 'Prevenzione', 'Prevenzione spalla', 'Capacità della spalla di tollerare prese, cadute e rilanci.', 'Molto alta', 'Alta', 'Alta', 'Alta', 'Alta', 'Prese; tuffi; respinte; rilanci', 'Integrare cuffia, scapola e catena cinetica.', true),
  ('FIS-046', 'Prevenzione', 'Prevenzione lombare/core', 'Capacità del complesso lombopelvico di gestire carichi e trasferimenti di forza.', 'Alta', 'Alta', 'Alta', 'Alta', 'Alta', 'Tutte le categorie', 'Non ridurre il lavoro al solo rinforzo addominale.', true),
  ('FIS-047', 'Capacità metabolica', 'Resistenza aerobica generale', 'Sviluppo della base aerobica e della capacità di recuperare tra gli sforzi.', 'Media', 'Molto alta', 'Bassa', 'Media', 'Alta', 'Lavoro generale; recupero', 'Più importante nel precampionato, poi mantenimento.', true),
  ('FIS-048', 'Capacità metabolica', 'Resistenza specifica intermittente', 'Capacità di sostenere sequenze intermittenti di lavoro e recupero.', 'Alta', 'Alta', 'Media', 'Alta', 'Media', 'Circuiti tecnici; sequenze di interventi', 'Preferire modalità intermittenti specifiche.', true),
  ('FIS-049', 'Capacità metabolica', 'Repeated Sprint Ability', 'Capacità di ripetere accelerazioni brevi ad alta intensità con recupero incompleto.', 'Media', 'Alta', 'Media', 'Media', 'Bassa', 'Uscite; transizioni; spostamenti', 'Usare con criterio per le richieste specifiche del portiere.', true),
  ('FIS-050', 'Capacità metabolica', 'Repeated Explosive Ability', 'Capacità di ripetere azioni esplosive mantenendo elevata qualità.', 'Molto alta', 'Alta', 'Alta', 'Alta', 'Bassa', 'Tuffi multipli; seconde palle; uscite', 'Più specifica per il portiere rispetto alla RSA classica.', true),
  ('FIS-051', 'Capacità metabolica', 'Recupero tra azioni intense', 'Capacità di recuperare rapidamente dopo un''azione ad alta intensità.', 'Alta', 'Alta', 'Alta', 'Alta', 'Media', 'Doppio intervento; sequenze tecniche', 'Gestire rapporto lavoro-recupero in modo programmato.', true),
  ('FIS-052', 'Capacità metabolica', 'Tolleranza a sequenze ad alta intensità', 'Capacità di mantenere efficacia tecnica durante brevi sequenze intense.', 'Molto alta', 'Alta', 'Alta', 'Alta', 'Bassa', 'Doppio/triplo intervento; circuiti specifici', 'La qualità tecnica non deve degradare eccessivamente.', true)
on conflict (codice) do update set
  macro_area = excluded.macro_area,
  obiettivo_fisico = excluded.obiettivo_fisico,
  descrizione = excluded.descrizione,
  priorita_portiere = excluded.priorita_portiere,
  precampionato = excluded.precampionato,
  periodo_competitivo = excluded.periodo_competitivo,
  richiamo_mantenimento = excluded.richiamo_mantenimento,
  recupero_rigenerazione = excluded.recupero_rigenerazione,
  abbinamenti_tecnici = excluded.abbinamenti_tecnici,
  note_programmazione = excluded.note_programmazione,
  attivo = excluded.attivo;

do $phase_b_verify$
declare
  imported_count integer;
begin
  select count(*) into imported_count
  from public.physical_objectives
  where codice = any (array['FIS-001', 'FIS-002', 'FIS-003', 'FIS-004', 'FIS-005', 'FIS-006', 'FIS-007', 'FIS-008', 'FIS-009', 'FIS-010', 'FIS-011', 'FIS-012', 'FIS-013', 'FIS-014', 'FIS-015', 'FIS-016', 'FIS-017', 'FIS-018', 'FIS-019', 'FIS-020', 'FIS-021', 'FIS-022', 'FIS-023', 'FIS-024', 'FIS-025', 'FIS-026', 'FIS-027', 'FIS-028', 'FIS-029', 'FIS-030', 'FIS-031', 'FIS-032', 'FIS-033', 'FIS-034', 'FIS-035', 'FIS-036', 'FIS-037', 'FIS-038', 'FIS-039', 'FIS-040', 'FIS-041', 'FIS-042', 'FIS-043', 'FIS-044', 'FIS-045', 'FIS-046', 'FIS-047', 'FIS-048', 'FIS-049', 'FIS-050', 'FIS-051', 'FIS-052']::text[]);

  if imported_count <> 52 then
    raise exception 'FASE B annullata: attesi 52 codici FIS, trovati %.', imported_count;
  end if;
end
$phase_b_verify$;

commit;

select
  'FASE B COMPLETATA' as risultato,
  count(*) filter (where codice = any (array['FIS-001', 'FIS-002', 'FIS-003', 'FIS-004', 'FIS-005', 'FIS-006', 'FIS-007', 'FIS-008', 'FIS-009', 'FIS-010', 'FIS-011', 'FIS-012', 'FIS-013', 'FIS-014', 'FIS-015', 'FIS-016', 'FIS-017', 'FIS-018', 'FIS-019', 'FIS-020', 'FIS-021', 'FIS-022', 'FIS-023', 'FIS-024', 'FIS-025', 'FIS-026', 'FIS-027', 'FIS-028', 'FIS-029', 'FIS-030', 'FIS-031', 'FIS-032', 'FIS-033', 'FIS-034', 'FIS-035', 'FIS-036', 'FIS-037', 'FIS-038', 'FIS-039', 'FIS-040', 'FIS-041', 'FIS-042', 'FIS-043', 'FIS-044', 'FIS-045', 'FIS-046', 'FIS-047', 'FIS-048', 'FIS-049', 'FIS-050', 'FIS-051', 'FIS-052']::text[])) as obiettivi_master_presenti,
  count(*) as obiettivi_totali_database
from public.physical_objectives;
