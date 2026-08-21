import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("include le tre sezioni principali", async () => {
  const app = await readFile(new URL("../app/keeper-app.tsx", import.meta.url), "utf8");
  assert.match(app, /Archivio esercizi/);
  assert.match(app, /Crea allenamento/);
  assert.match(app, /Agenda settimanale/);
  assert.match(app, /item\.category_id === current\.category_id/);
});

test("espone una PWA installabile", async () => {
  const manifest = JSON.parse(await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
  const serviceWorker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some(icon => icon.sizes === "512x512"));
  assert.match(serviceWorker, /addEventListener\("fetch"/);
});

test("blocca tutte le route diagnostiche nel Worker production", async () => {
  const worker = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
  assert.match(worker, /process\.env\.NODE_ENV === "production"/);
  assert.match(worker, /url\.pathname === "\/dev"/);
  assert.match(worker, /url\.pathname\.startsWith\("\/dev\/"\)/);
  assert.match(worker, /status: 404/);
  assert.match(worker, /"cache-control": "no-store"/);
});

test("include lo schema Supabase richiesto", async () => {
  const schema = await readFile(new URL("../supabase/migrations/0001_initial_schema.sql", import.meta.url), "utf8");
  for (const table of ["exercises", "trainings", "training_objectives", "training_exercises"]) {
    assert.match(schema, new RegExp(`create table public\\.${table}`));
  }
});

test("include impostazioni persistenti del preparatore", async () => {
  const app = await readFile(new URL("../app/keeper-app.tsx", import.meta.url), "utf8");
  const schema = await readFile(new URL("../supabase/migrations/0002_app_settings.sql", import.meta.url), "utf8");
  assert.match(app, /Apri impostazioni/);
  assert.match(app, /Nome preparatore/);
  assert.match(app, /Valori predefiniti/);
  assert.match(schema, /create table public\.app_settings/);
});

test("usa la gerarchia tecnica ufficiale dell’archivio", async () => {
  const app = await readFile(new URL("../app/keeper-app.tsx", import.meta.url), "utf8");
  const card = await readFile(new URL("../app/components/exercise-card.tsx", import.meta.url), "utf8");
  const migration = await readFile(new URL("../supabase/migrations/0003_official_exercise_catalog.sql", import.meta.url), "utf8");
  assert.match(app, /Filtra sottocategoria/);
  assert.match(app, /Filtra fase metodologica/);
  assert.match(card, /Apri scheda/);
  assert.match(app, /variant="detail"/);
  assert.match(card, /manual-media-split schema-only/);
  assert.match(migration, /create table public\.exercise_categories/);
  assert.match(migration, /create table public\.exercise_subcategories/);
  assert.match(migration, /exercises_subcategory_category_fk/);
});

test("usa lo standard definitivo del catalogo e importa 36 esercizi senza duplicati", async () => {
  const app = await readFile(new URL("../app/keeper-app.tsx", import.meta.url), "utf8");
  const card = await readFile(new URL("../app/components/exercise-card.tsx", import.meta.url), "utf8");
  const migration = await readFile(new URL("../supabase/migrations/0004_definitive_exercise_catalog.sql", import.meta.url), "utf8");
  assert.match(app, /Filtra intensità/);
  assert.match(app, /Filtra difficoltà/);
  assert.match(card, /export function ExerciseCard/);
  assert.match(card, /Schema tattico/);
  assert.match(card, /ExerciseTacticalBoard/);
  assert.match(card, /Coaching points/);
  assert.match(card, /Errori comuni/);
  assert.match(migration, /check \(fase in \('Analitico', 'Disturbo', 'Situazionale'\)\)/);
  assert.match(migration, /check \(difficolta in \(1, 2, 3\)\)/);
  assert.match(migration, /alter column legacy_category drop not null/);
  assert.match(migration, /alter column legacy_subcategory drop not null/);
  assert.match(migration, /on conflict \(codice\) do update/i);
  assert.equal((migration.match(/\('GK-PRA-/g) ?? []).length, 36);
});

test("usa Tactical Board come unico sistema visuale degli esercizi", async () => {
  const app = await readFile(new URL("../app/keeper-app.tsx", import.meta.url), "utf8");
  const card = await readFile(new URL("../app/components/exercise-card.tsx", import.meta.url), "utf8");
  const types = await readFile(new URL("../lib/types.ts", import.meta.url), "utf8");
  const production = `${app}\n${card}\n${types}`;
  assert.match(card, /exercise\.tactical_diagram/);
  assert.match(card, /ExerciseTacticalBoard/);
  assert.doesNotMatch(production, /ExerciseImageModal|ExerciseImageField|BulkImageImportModal|getSessionExerciseImage/);
  assert.doesNotMatch(production, /schema_url|foto_url|immagine_url|Importa immagini/);
});

test("sincronizza GK-PRA-001–018 e mostra lo svolgimento senza toccare le immagini", async () => {
  const app = await readFile(new URL("../app/keeper-app.tsx", import.meta.url), "utf8");
  const card = await readFile(new URL("../app/components/exercise-card.tsx", import.meta.url), "utf8");
  const types = await readFile(new URL("../lib/types.ts", import.meta.url), "utf8");
  const migration = await readFile(new URL("../supabase/migrations/0006_sync_gk_pra_001_018.sql", import.meta.url), "utf8");
  assert.match(types, /schema_step_1: string \| null/);
  assert.match(types, /schema_step_2: string \| null/);
  assert.match(app, /Svolgimento · Passaggio 1/);
  assert.match(card, /Svolgimento/);
  assert.match(migration, /unique \(category_id, nome, fase\)/);
  assert.match(migration, /Presa alta con intervento attivo/);
  assert.match(migration, /Presa bassa con intervento attivo/);
  assert.match(migration, /update public\.exercises e/);
  assert.match(migration, /where e\.codice = o\.codice/);
  assert.doesNotMatch(migration, /Ãƒ|Ã‚/);
  for (let index = 1; index <= 18; index += 1) {
    assert.match(migration, new RegExp(`GK-PRA-${String(index).padStart(3, "0")}`));
  }
});

test("sincronizza GK-PRA-001–036 con uno svolgimento fino a cinque passaggi", async () => {
  const app = await readFile(new URL("../app/keeper-app.tsx", import.meta.url), "utf8");
  const card = await readFile(new URL("../app/components/exercise-card.tsx", import.meta.url), "utf8");
  const types = await readFile(new URL("../lib/types.ts", import.meta.url), "utf8");
  const migration = await readFile(new URL("../supabase/migrations/0007_sync_gk_pra_001_036.sql", import.meta.url), "utf8");
  assert.match(types, /schema_step_3: string \| null/);
  assert.match(types, /schema_step_4: string \| null/);
  assert.match(types, /schema_step_5: string \| null/);
  assert.match(app, /Passaggio 5/);
  assert.match(card, /procedureSteps\.map/);
  assert.match(migration, /Deviazione con intervento attivo/);
  assert.match(migration, /update public\.exercises e/);
  assert.match(migration, /where e\.codice = o\.codice/);
  assert.doesNotMatch(migration, /insert into public\.exercises/i);
  for (let index = 1; index <= 36; index += 1) {
    assert.match(migration, new RegExp(`GK-PRA-${String(index).padStart(3, "0")}`));
  }
});

test("dispone i filtri dell'archivio in riquadri responsive senza sovrapposizioni", async () => {
  const app = await readFile(new URL("../app/keeper-app.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(app, /archive-filter-panel/);
  assert.match(app, /Cerca e filtra/);
  assert.match(app, /Azzera filtri/);
  assert.match(css, /archive-filter-grid\s*\{[^}]*repeat\(auto-fit,minmax\(180px,1fr\)\)/s);
  assert.match(css, /filter-select\s*\{[^}]*width:100%[^}]*min-width:0/s);
});

test("mostra sottocategorie tecniche pulite e mantiene separata la fase", async () => {
  const app = await readFile(new URL("../app/keeper-app.tsx", import.meta.url), "utf8");
  const migration = await readFile(new URL("../supabase/migrations/0008_clean_exercise_subcategories.sql", import.meta.url), "utf8");
  assert.match(app, /function cleanSubcategoryLabel/);
  assert.match(app, /Presa alta con intervento attivo.*Presa alta/s);
  assert.match(app, /Array\.from\(new Set/);
  assert.doesNotMatch(app, /\{item\.nome\} · \{item\.fase\}/);
  assert.match(migration, /where s\.nome ~\* '\\s\+2\$'/);
  assert.match(migration, /delete from public\.exercise_subcategories where nome ~\* '\\s\+2\$'/);
  assert.match(migration, /set sottocategoria = s\.nome/);
  assert.match(migration, /when 142 then 1/);
});

test("sincronizza GK-PRA-001–040, aggiunge quattro esercizi e preserva le immagini", async () => {
  const app = await readFile(new URL("../app/keeper-app.tsx", import.meta.url), "utf8");
  const card = await readFile(new URL("../app/components/exercise-card.tsx", import.meta.url), "utf8");
  const types = await readFile(new URL("../lib/types.ts", import.meta.url), "utf8");
  const migration = await readFile(new URL("../supabase/migrations/0009_sync_gk_pra_001_040.sql", import.meta.url), "utf8");
  assert.match(types, /schema_step_6: string \| null/);
  assert.match(app, /Passaggio 6/);
  assert.match(card, /exercise\.schema_step_6/);
  assert.match(migration, /add column if not exists schema_step_6 text/);
  assert.match(migration, /check \(difficolta in \(1, 2, 3, 4\)\)/);
  assert.match(types, /ExerciseDifficulty = 1 \| 2 \| 3 \| 4 \| 5/);
  assert.match(app, /value="5">.*Master/);
  assert.match(migration, /on conflict \(codice\) do update set/i);
  assert.match(migration, /GK-PRA-037/);
  assert.match(migration, /GK-PRA-040/);
  for (let index = 1; index <= 40; index += 1) {
    assert.match(migration, new RegExp(`GK-PRA-${String(index).padStart(3, "0")}`));
  }
});

test("importa 52 obiettivi fisici e collega un obiettivo facoltativo alle sedute", async () => {
  const app = await readFile(new URL("../app/keeper-app.tsx", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/components/physical-objectives.tsx", import.meta.url), "utf8");
  const types = await readFile(new URL("../lib/types.ts", import.meta.url), "utf8");
  const migration = await readFile(new URL("../supabase/migrations/0010_physical_objectives.sql", import.meta.url), "utf8");
  assert.match(types, /export type PhysicalObjective/);
  assert.match(app, /Preparazione fisica/);
  assert.match(app, /Obiettivo tecnico principale/);
  assert.match(app, /Obiettivo fisico principale/);
  assert.match(app, /physical_objective:physical_objectives/);
  assert.match(page, /Fase della stagione/);
  assert.match(page, /Abbinamenti tecnici/);
  assert.match(migration, /create table if not exists public\.physical_objectives/);
  assert.match(migration, /codice text not null unique/);
  assert.match(migration, /add column if not exists physical_objective_id uuid/);
  assert.match(migration, /references public\.physical_objectives\(id\)/);
  assert.match(migration, /on delete set null/);
  assert.match(migration, /on conflict \(codice\) do update set/);
  assert.doesNotMatch(migration, /delete from|drop table|truncate/i);
  assert.equal((migration.match(/\('FIS-/g) ?? []).length, 52);
  for (let index = 1; index <= 52; index += 1) {
    assert.match(migration, new RegExp(`FIS-${String(index).padStart(3, "0")}`));
  }
});

test("importa 196 compatibilità fisiche e le gestisce nel catalogo tecnico", async () => {
  const app = await readFile(new URL("../app/keeper-app.tsx", import.meta.url), "utf8");
  const card = await readFile(new URL("../app/components/exercise-card.tsx", import.meta.url), "utf8");
  const editor = await readFile(new URL("../app/components/exercise-physical-objectives-editor.tsx", import.meta.url), "utf8");
  const types = await readFile(new URL("../lib/types.ts", import.meta.url), "utf8");
  const migration = await readFile(new URL("../supabase/migrations/0011_exercise_physical_objectives.sql", import.meta.url), "utf8");
  assert.match(types, /export type ExercisePhysicalObjective/);
  assert.match(app, /physical_mappings:exercise_physical_objectives/);
  assert.match(app, /Filtra obiettivo fisico/);
  assert.match(app, /bWeight - aWeight/);
  assert.match(app, /set_exercise_physical_objective/);
  assert.match(card, /Componenti fisiche/);
  assert.match(card, /repeat\(5 - mapping\.peso\)/);
  assert.match(editor, /Obiettivi fisici associati/);
  assert.match(editor, /Caratteristiche fisiche/);
  assert.match(editor, /NewExercisePhysicalObjectivesEditor/);
  assert.match(app, /newPhysicalMappings/);
  assert.match(app, /insert\(payload\)\.select\("id"\)\.single\(\)/);
  assert.match(editor, /Principale.*Secondario.*Complementare/s);
  assert.match(migration, /create table if not exists public\.exercise_physical_objectives/);
  assert.match(migration, /unique \(exercise_id, physical_objective_id\)/);
  assert.match(migration, /where ruolo = 'Principale'/);
  assert.match(migration, /peso between 1 and 5/);
  assert.match(migration, /on conflict \(exercise_id, physical_objective_id\) do update set/);
  assert.match(migration, /get_exercises_by_physical_objective/);
  assert.match(migration, /order by mapping\.peso desc/);
  assert.match(migration, /set_exercise_physical_objective/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.(exercises|physical_objectives|trainings)/i);
  assert.equal((migration.match(/"exercise_code":"GK-PRA-\d{3}","physical_objective_code":"FIS-\d{3}"/g) ?? []).length, 196);
  assert.match(migration, /jsonb_to_recordset\(mapping_data\)/);
  assert.doesNotMatch(migration, /mapping_import_0011/);
});

test("prepara in sicurezza lo schema per il catalogo MASTER", async () => {
  const migration = await readFile(new URL("../supabase/migrations/0012_master_catalog_schema.sql", import.meta.url), "utf8");
  assert.match(migration, /add column if not exists scenario_gara text/);
  assert.match(migration, /add column if not exists numero_azioni text/);
  assert.match(migration, /'Bassa-Media'.*'Media-Alta'/s);
  assert.match(migration, /difficolta between 1 and 5/);
  assert.match(migration, /'Integrato guidato'.*'Scenario aperto'/s);
  assert.match(migration, /unique \(category_id, nome, fase\)/);
  assert.match(migration, /exercise_subcategories_id_seq/);
  assert.match(migration, /FASE A COMPLETATA/);
  assert.doesNotMatch(migration, /\b(?:delete|truncate|drop table)\b/i);
  assert.doesNotMatch(migration, /insert into public\.exercises/i);
});

test("sincronizza i 52 obiettivi fisici dalla sorgente MASTER", async () => {
  const migration = await readFile(new URL("../supabase/migrations/0013_master_physical_objectives.sql", import.meta.url), "utf8");
  assert.match(migration, /insert into public\.physical_objectives as target/);
  assert.match(migration, /on conflict \(codice\) do update set/);
  assert.match(migration, /FASE B COMPLETATA/);
  assert.match(migration, /imported_count <> 52/);
  assert.equal((migration.match(/\('FIS-\d{3}'/g) ?? []).length, 52);
  for (let index = 1; index <= 52; index += 1) {
    assert.match(migration, new RegExp(`FIS-${String(index).padStart(3, "0")}`));
  }
  assert.doesNotMatch(migration, /\b(?:delete|truncate|drop table)\b/i);
});

test("sincronizza tassonomia e 460 esercizi dal Catalogo MASTER", async () => {
  const migration = await readFile(new URL("../supabase/migrations/0014_master_exercise_catalog.sql", import.meta.url), "utf8");
  assert.match(migration, /jsonb_to_recordset\(catalog_data\)/);
  assert.match(migration, /on conflict \(category_id, nome, fase\) do update set/);
  assert.match(migration, /on conflict \(codice\) do update set/);
  assert.match(migration, /scenario_gara = excluded\.scenario_gara/);
  assert.match(migration, /numero_azioni = excluded\.numero_azioni/);
  assert.match(migration, /FASE C COMPLETATA/);
  assert.equal((migration.match(/"codice":"GK-[^"]+"/g) ?? []).length, 460);
  assert.equal((migration.match(/"categoria":"Match Simulation"/g) ?? []).length, 60);
  for (const category of [
    "Tecnica presa alta e rasoterra",
    "Tuffi laterali e reattività",
    "Uscite basse e 1vs1",
    "Reattività con ostacoli e tuffi",
    "Uscite alte e palle aeree",
    "Tecnica di piede",
    "Parate ravvicinate",
    "Match Simulation",
    "Tecnica 1v1 - copertura angoli",
    "Posizionamento porta",
    "Tema libero",
  ]) {
    assert.match(migration, new RegExp(category));
  }
  assert.doesNotMatch(migration, /\b(?:delete|truncate|drop table)\b/i);
  assert.doesNotMatch(migration, /mapping_import_|catalog_import_/i);
});

test("risolve gli UUID reali delle 1.985 mappature MASTER senza modificare dati", async () => {
  const migration = await readFile(new URL("../supabase/migrations/0015_master_mapping_resolution.sql", import.meta.url), "utf8");
  assert.match(migration, /FASE D COMPLETATA/);
  assert.match(migration, /jsonb_to_recordset\(mapping_data\)/);
  assert.match(migration, /join public\.exercises as exercise on exercise\.codice = source\.exercise_code/);
  assert.match(migration, /join public\.physical_objectives as objective on objective\.codice = source\.physical_objective_code/);
  assert.match(migration, /resolved_count <> 1985/);
  assert.match(migration, /source_exercise_count <> 460/);
  assert.match(migration, /source_objective_count <> 27/);
  assert.match(migration, /having count\(\*\) > 1/);
  assert.match(migration, /mappature_da_importare_fase_e/);
  assert.equal((migration.match(/"exercise_code":"GK-[^"]+","physical_objective_code":"FIS-\d{3}"/g) ?? []).length, 1985);
  assert.doesNotMatch(migration, /\b(?:insert\s+into|update\s+public|delete\s+from|truncate|drop table|create table)\b/i);
  assert.doesNotMatch(migration, /mapping_import_/i);
});

test("importa con UPSERT le 1.985 mappature fisiche MASTER", async () => {
  const migration = await readFile(new URL("../supabase/migrations/0016_master_physical_mappings.sql", import.meta.url), "utf8");
  assert.match(migration, /FASE E COMPLETATA/);
  assert.match(migration, /insert into public\.exercise_physical_objectives as target/);
  assert.match(migration, /on conflict \(exercise_id, physical_objective_id\) do update set/);
  assert.match(migration, /join public\.exercises as exercise on exercise\.codice = source\.exercise_code/);
  assert.match(migration, /join public\.physical_objectives as objective on objective\.codice = source\.physical_objective_code/);
  assert.match(migration, /set ruolo = 'Secondario'/);
  assert.match(migration, /conflicting_extra_primary <> 0/);
  assert.match(migration, /exact_match_count <> 1985/);
  assert.match(migration, /imported_primary_count <> 460/);
  assert.match(migration, /mappature_inserite/);
  assert.equal((migration.match(/"exercise_code":"GK-[^"]+","physical_objective_code":"FIS-\d{3}"/g) ?? []).length, 1985);
  assert.doesNotMatch(migration, /\b(?:delete\s+from|truncate|drop table)\b/i);
  assert.doesNotMatch(migration, /mapping_import_/i);
});

test("completa la verifica MASTER e rende l'interfaccia compatibile", async () => {
  const app = await readFile(new URL("../app/keeper-app.tsx", import.meta.url), "utf8");
  const card = await readFile(new URL("../app/components/exercise-card.tsx", import.meta.url), "utf8");
  const types = await readFile(new URL("../lib/types.ts", import.meta.url), "utf8");
  const migration = await readFile(new URL("../supabase/migrations/0017_master_final_verification.sql", import.meta.url), "utf8");
  assert.match(types, /Integrato guidato.*Integrato variabile.*Situazionale complesso.*Scenario aperto/);
  assert.match(types, /Bassa-Media.*Media-Alta/);
  assert.match(types, /ExerciseDifficulty = 1 \| 2 \| 3 \| 4 \| 5/);
  assert.match(types, /scenario_gara: string \| null/);
  assert.match(types, /numero_azioni: string \| null/);
  assert.match(app, /const catalogPhases/);
  assert.match(app, /const exerciseIntensities/);
  assert.match(app, /value="5">.*Master/);
  assert.match(app, /Scenario gara/);
  assert.match(app, /Numero azioni/);
  assert.match(card, /repeat\(5 - exercise\.difficolta\)/);
  assert.match(card, /exercise\.scenario_gara/);
  assert.match(migration, /FASE F COMPLETATA/);
  assert.match(migration, /master_exercises <> 460/);
  assert.match(migration, /physical_mappings <> 1985/);
  assert.match(migration, /complete_match_simulation <> 60/);
  assert.doesNotMatch(migration, /\b(?:insert\s+into|update\s+public|delete\s+from|truncate|drop table|create table)\b/i);
});

test("aggiunge la pianificazione stagione senza eliminare dati esistenti", async () => {
  const schema = await readFile(new URL("../supabase/migrations/0018_season_calendar.sql", import.meta.url), "utf8");
  const generator = await readFile(new URL("../supabase/migrations/0019_season_calendar_functions.sql", import.meta.url), "utf8");
  const app = await readFile(new URL("../app/keeper-app.tsx", import.meta.url), "utf8");
  const agenda = await readFile(new URL("../app/components/season-agenda.tsx", import.meta.url), "utf8");
  const settings = await readFile(new URL("../app/components/season-settings.tsx", import.meta.url), "utf8");
  for (const table of ["seasons", "season_phases", "season_recall_periods", "season_training_profiles", "matches", "calendar_exceptions", "calendar_days"]) {
    assert.match(schema, new RegExp(`create table if not exists public\\.${table}`));
  }
  assert.match(schema, /physical_objective_id uuid references public\.physical_objectives/);
  assert.match(schema, /content_status in \('empty', 'compiled', 'manual'\)/);
  assert.doesNotMatch(schema, /\b(?:delete\s+from|truncate|drop table)\b/i);
  assert.match(generator, /preview_season_agenda/);
  assert.match(generator, /generate_season_agenda/);
  assert.match(generator, /training\.generated_by_calendar and training\.content_status = 'empty'/);
  assert.match(generator, /on conflict \(calendar_day_id, session_number\).*do nothing/s);
  assert.doesNotMatch(generator, /training_exercises|\b(?:delete\s+from|truncate|drop table)\b/i);
  assert.match(app, /<SeasonAgenda/);
  assert.match(app, /<SeasonSettings/);
  assert.match(app, /<CalendarDayModal/);
  assert.match(agenda, /Seduta vuota programmata/);
  assert.match(settings, /Genera \/ aggiorna agenda/);
  assert.match(settings, /Calendario gare/);
  assert.match(settings, /Eccezioni/);
});

test("aggiunge anagrafica e valutazioni storiche dei portieri senza modificare il generatore", async () => {
  const schema = await readFile(new URL("../supabase/migrations/0020_goalkeeper_assessments.sql", import.meta.url), "utf8");
  const dimensions = await readFile(new URL("../supabase/migrations/0021_goalkeeper_assessment_dimensions.sql", import.meta.url), "utf8");
  const app = await readFile(new URL("../app/keeper-app.tsx", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/components/goalkeepers-page.tsx", import.meta.url), "utf8");
  const priorities = await readFile(new URL("../lib/goalkeeper-priorities.ts", import.meta.url), "utf8");
  for (const table of ["goalkeepers", "physical_assessment_dimensions", "physical_assessment_dimension_objectives", "goalkeeper_assessments", "goalkeeper_assessment_items", "training_goalkeepers", "training_exercise_goalkeeper_variants"]) {
    assert.match(schema, new RegExp(`create table if not exists public\\.${table}`));
  }
  assert.match(schema, /score numeric\(3,1\).*score >= 0 and score <= 10/s);
  assert.match(schema, /references public\.exercise_categories/);
  assert.match(schema, /references public\.physical_objectives/);
  assert.match(schema, /on delete restrict/);
  assert.doesNotMatch(schema, /\b(?:delete\s+from|truncate|drop table)\b/i);
  assert.equal((dimensions.match(/\('PHY-[A-Z-]+', '[^']+', '[^']+', \d+\)/g) ?? []).length, 12);
  for (let index = 1; index <= 52; index += 1) assert.match(dimensions, new RegExp(`FIS-${String(index).padStart(3, "0")}`));
  assert.match(dimensions, /create_goalkeeper_assessment/);
  assert.match(dimensions, /Tema libero non è una capacità tecnica valutabile/);
  assert.doesNotMatch(dimensions, /\b(?:delete\s+from|truncate|drop table)\b/i);
  assert.match(app, /id: "goalkeepers"/);
  assert.match(app, /<GoalkeepersPage/);
  assert.match(page, /Nuova valutazione/);
  assert.match(page, /step="0\.1"/);
  assert.match(page, /Storico valutazioni/);
  assert.match(page, /Carenze principali/);
  assert.match(priorities, /getGoalkeeperTrainingPriorities/);
  assert.match(priorities, /getGroupTrainingPriorities/);
  assert.match(priorities, /0\.6 \* assessmentPriorityBonus\(average\)/);
});

test("pianifica la seduta con ranking spiegabili e quattro blocchi senza scegliere esercizi", async () => {
  const migration = await readFile(new URL("../supabase/migrations/0022_session_profile_planner.sql", import.meta.url), "utf8");
  const app = await readFile(new URL("../app/keeper-app.tsx", import.meta.url), "utf8");
  const planner = await readFile(new URL("../app/components/session-planner.tsx", import.meta.url), "utf8");
  const service = await readFile(new URL("../lib/session-planner/index.ts", import.meta.url), "utf8");
  assert.match(migration, /create table if not exists public\.weekly_training_focus/);
  assert.match(migration, /create table if not exists public\.training_blocks/);
  assert.match(migration, /technical_ranking_snapshot jsonb/);
  assert.match(migration, /physical_ranking_snapshot jsonb/);
  assert.match(migration, /unique \(training_id, ordine\)/);
  assert.doesNotMatch(migration, /\b(?:delete\s+from|truncate|drop table)\b/i);
  assert.match(app, /<SessionPlanner/);
  assert.match(app, /training_goalkeepers/);
  assert.match(app, /training_blocks/);
  assert.doesNotMatch(app, /training_exercises"\)\.delete/);
  assert.doesNotMatch(app, /training_exercises"\)\.insert/);
  assert.match(planner, /Automatico.*Assistito.*Manuale/s);
  assert.match(planner, /Calcola priorità e blocchi/);
  assert.match(service, /TECHNICAL_WEIGHTS/);
  assert.match(service, /PHYSICAL_WEIGHTS/);
  assert.match(service, /buildSessionBlocks/);
});

test("genera esercizi ranked nei blocchi con snapshot senza duplicare il catalogo", async () => {
  const migration = await readFile(new URL("../supabase/migrations/0023_ranked_exercise_selection.sql", import.meta.url), "utf8");
  const engine = await readFile(new URL("../lib/session-planner/exercise-selection.ts", import.meta.url), "utf8");
  const preview = await readFile(new URL("../app/components/session-exercise-preview.tsx", import.meta.url), "utf8");
  assert.match(migration,/add column if not exists training_block_id/);
  assert.match(migration,/selection_snapshot jsonb/);
  assert.match(migration,/replace_generated_training_exercises/);
  assert.doesNotMatch(migration,/insert into public\.(?:exercises|exercise_physical_objectives)/i);
  for(const fn of ["getExerciseCandidates","scoreExercise","calculateRotationScore","selectExercisesForBlock","selectSessionExercises"]) assert.match(engine,new RegExp(`function ${fn}`));
  assert.match(engine,/closeScoreRange/);
  assert.match(engine,/fallbackLevel/);
  assert.match(preview,/top 10 candidati/);
  assert.match(preview,/Tempo netto/);
});

test("rende la seduta modificabile con lock, alternative, qualità e varianti",async()=>{const migration=await readFile(new URL("../supabase/migrations/0024_session_editor_quality.sql",import.meta.url),"utf8");const preview=await readFile(new URL("../app/components/session-exercise-preview.tsx",import.meta.url),"utf8");const card=await readFile(new URL("../app/components/session-exercise-card.tsx",import.meta.url),"utf8");const quality=await readFile(new URL("../lib/session-planner/session-quality.ts",import.meta.url),"utf8");assert.match(migration,/locked boolean/);assert.match(migration,/session_generation_snapshot/);assert.match(migration,/training_exercise_changes/);assert.match(migration,/training_exercise_goalkeeper_variants/);assert.doesNotMatch(migration,/insert into public\.(?:exercises|exercise_physical_objectives)/i);assert.match(preview,/Rigenera esercizi/);assert.match(preview,/Rigenera blocco/);assert.match(card,/Sostituisci/);assert.match(quality,/SESSION_QUALITY_WEIGHTS/);assert.match(quality,/technical:.20.*physical:.15.*duration:.10/s);});

test("mostra esercizi nei blocchi con scheda completa e modalità campo",async()=>{const app=await readFile(new URL("../app/keeper-app.tsx",import.meta.url),"utf8");const preview=await readFile(new URL("../app/components/session-exercise-preview.tsx",import.meta.url),"utf8");const card=await readFile(new URL("../app/components/session-exercise-card.tsx",import.meta.url),"utf8");const field=await readFile(new URL("../app/components/session-field-mode.tsx",import.meta.url),"utf8");assert.match(preview,/groupSessionExercises/);assert.match(preview,/SessionExerciseCard/);assert.match(app,/catalogById/);assert.match(card,/Perché è stato scelto/);assert.match(card,/ExerciseTacticalBoard/);assert.match(field,/Precedente/);assert.match(field,/Successivo/);assert.match(field,/ExerciseTacticalBoard/);assert.doesNotMatch(field,/technical_fit|physical_fit|rotation_score/);});

test("il caricamento iniziale non apre conferme distruttive", async () => {
  const app = await readFile(new URL("../app/keeper-app.tsx", import.meta.url), "utf8");
  for (const loader of ["loadExercises", "loadCatalog", "loadPhysicalObjectives"]) {
    const start = app.indexOf(`const ${loader} = useCallback`);
    const end = app.indexOf("}, []);", start);
    assert.ok(start >= 0 && end > start, `${loader} deve essere presente`);
    assert.doesNotMatch(app.slice(start, end), /window\.confirm/);
  }
  const deleteStart = app.indexOf("async function deleteTraining");
  const deleteEnd = app.indexOf("async function saveSeasonConfiguration", deleteStart);
  const deleteFlow = app.slice(deleteStart, deleteEnd);
  assert.match(deleteFlow, /window\.confirm/);
  assert.match(deleteFlow, /Eliminare definitivamente questa seduta\?/);
  assert.match(deleteFlow, /delete_owned_evaluation_training/);
});
