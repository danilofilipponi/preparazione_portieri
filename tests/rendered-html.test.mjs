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
