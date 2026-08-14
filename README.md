# KeeperLab

PWA responsive per organizzare gli allenamenti dei portieri di calcio adulti.

La prima versione include archivio esercizi, composizione guidata della seduta e
agenda settimanale. Non include atleti, statistiche avanzate, ruoli, pagamenti,
AI o notifiche.

## Avvio

1. Copiare `.env.example` in `.env.local`.
2. Inserire URL e chiave anon del progetto Supabase.
3. Eseguire la migrazione in `supabase/migrations/0001_initial_schema.sql` nel
   SQL Editor di Supabase.
4. Eseguire `supabase/migrations/0003_official_exercise_catalog.sql` per
   importare le 12 categorie e le 141 sottocategorie ufficiali.
5. Eseguire `supabase/migrations/0004_definitive_exercise_catalog.sql` per
   applicare lo standard definitivo e importare i 36 esercizi della prima
   categoria. L'importazione usa il codice come chiave e può essere rieseguita
   senza creare duplicati.
6. La migration storica `0005_exercise_images_storage.sql` non fa più parte del workflow corrente: la Tactical Board V2 è l'unico sistema visuale.
7. Eseguire `supabase/migrations/0006_sync_gk_pra_001_018.sql` per sincronizzare
   i record GK-PRA-001–018 e aggiungere i due passaggi dello svolgimento.
8. Eseguire `supabase/migrations/0007_sync_gk_pra_001_036.sql` per sincronizzare
   i record GK-PRA-001–036 e supportare fino a cinque passaggi.
9. Eseguire `supabase/migrations/0008_clean_exercise_subcategories.sql` per
   rimuovere i duplicati e separare i nomi tecnici dalla fase metodologica.
10. Eseguire `supabase/migrations/0009_sync_gk_pra_001_040.sql` per sincronizzare
    GK-PRA-001–040, aggiungere i quattro nuovi esercizi e il sesto passaggio.
11. Avviare con `npm run dev`.

Senza variabili Supabase l'interfaccia si apre in modalità demo con dati di
esempio. La struttura dettagliata e la spiegazione delle tabelle sono in
`docs/architecture.md`.
