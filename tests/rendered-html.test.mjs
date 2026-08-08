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

test("include lo schema Supabase richiesto", async () => {
  const schema = await readFile(new URL("../supabase/migrations/0001_initial_schema.sql", import.meta.url), "utf8");
  for (const table of ["exercises", "trainings", "training_objectives", "training_exercises"]) {
    assert.match(schema, new RegExp(`create table public\\.${table}`));
  }
  assert.match(schema, /exercise-images/);
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
  assert.match(card, /Schema tecnico/);
  assert.match(card, /Coaching points/);
  assert.match(card, /Errori comuni/);
  assert.match(migration, /check \(fase in \('Analitico', 'Disturbo', 'Situazionale'\)\)/);
  assert.match(migration, /check \(difficolta in \(1, 2, 3\)\)/);
  assert.match(migration, /alter column legacy_category drop not null/);
  assert.match(migration, /alter column legacy_subcategory drop not null/);
  assert.match(migration, /on conflict \(codice\) do update/i);
  assert.equal((migration.match(/\('GK-PRA-/g) ?? []).length, 36);
});

test("gestisce immagini singole e importazione multipla senza duplicati", async () => {
  const app = await readFile(new URL("../app/keeper-app.tsx", import.meta.url), "utf8");
  const tools = await readFile(new URL("../app/components/exercise-image-tools.tsx", import.meta.url), "utf8");
  const storage = await readFile(new URL("../lib/exercise-images.ts", import.meta.url), "utf8");
  const migration = await readFile(new URL("../supabase/migrations/0005_exercise_images_storage.sql", import.meta.url), "utf8");
  assert.match(app, /Importa immagini/);
  assert.match(app, /parseExerciseImageName/);
  assert.match(app, /Immagini esercizio/i);
  assert.match(tools, /Carica immagine/);
  assert.match(tools, /Sostituisci immagine/);
  assert.match(tools, /Elimina immagine/);
  assert.match(tools, /File elaborati/);
  assert.match(tools, /Schemi caricati/);
  assert.match(tools, /Foto caricate/);
  assert.match(storage, /`\$\{normalized\}\/\$\{kind\}\.webp`/);
  assert.match(storage, /upsert: true/);
  assert.match(storage, /image\/webp/);
  assert.match(migration, /on conflict \(id\) do update set public = true/);
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
  assert.doesNotMatch(migration, /schema_url\s*=/);
  assert.doesNotMatch(migration, /foto_url\s*=/);
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
  assert.doesNotMatch(migration, /schema_url\s*=/);
  assert.doesNotMatch(migration, /foto_url\s*=/);
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
  assert.match(types, /difficolta: 1 \| 2 \| 3 \| 4/);
  assert.match(app, /★★★★ Élite/);
  assert.match(migration, /on conflict \(codice\) do update set/i);
  assert.match(migration, /GK-PRA-037/);
  assert.match(migration, /GK-PRA-040/);
  assert.doesNotMatch(migration, /schema_url\s*=/);
  assert.doesNotMatch(migration, /foto_url\s*=/);
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
