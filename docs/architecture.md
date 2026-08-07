# KeeperLab — struttura della prima versione

## Cartelle

```text
app/                         interfaccia React e navigazione principale
  keeper-app.tsx             archivio, compositore e agenda
  layout.tsx                 metadati PWA e struttura globale
  pwa-register.tsx           registrazione del service worker
lib/
  supabase.ts                client Supabase centralizzato
  types.ts                   tipi condivisi del dominio
public/
  manifest.webmanifest       configurazione di installazione PWA
  sw.js                      cache di base per l'avvio offline
supabase/
  migrations/                schema SQL versionato
docs/
  architecture.md            architettura e modello dati
```

Quando il progetto crescerà, le tre sezioni potranno essere spostate da
`keeper-app.tsx` in `app/components/exercises`, `app/components/trainings` e
`app/components/calendar`. Per questa prima base, tenerle insieme rende più
facile verificare il flusso completo senza introdurre astrazioni premature.

## Tabelle Supabase

### `exercises`

È l'archivio principale. Contiene tutti i campi richiesti, compresi durata,
intervallo di portieri compatibile e `image_path`. Quest'ultimo conserva solo
il percorso del file nel bucket Storage `exercise-images`, non l'immagine.

### `trainings`

Rappresenta la testata della seduta: data, durata totale pianificata, numero di
portieri, note e stato. È la tabella usata dall'agenda settimanale.

### `training_objectives`

Collega una seduta ai suoi obiettivi. È separata perché un allenamento può
avere più obiettivi e permette filtri futuri senza salvare liste in un campo di
testo.

### `training_exercises`

È la sequenza ordinata degli esercizi scelti per una seduta. Salva posizione e
durata pianificata, così una sostituzione o una modifica non altera il dato
originale dell'esercizio.

## Criterio di proposta

La base filtra prima per numero di portieri, dà priorità agli obiettivi scelti e
aggiunge esercizi fino a coprire la durata richiesta. La sostituzione cerca solo
esercizi della stessa categoria, come richiesto. Questa logica è deliberatamente
deterministica: non usa AI.

## Sicurezza della prima versione

La migrazione include policy pubbliche perché l'app richiesta non prevede ancora
autenticazione o ruoli. È appropriato solo per un prototipo controllato. Prima di
pubblicare dati reali per più utenti sarà necessario aggiungere autenticazione e
policy basate sul proprietario del record.
