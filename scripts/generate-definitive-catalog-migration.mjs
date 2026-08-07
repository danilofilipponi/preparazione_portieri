import { readFileSync, writeFileSync } from "node:fs";

const [catalogPath, hierarchyPath] = process.argv.slice(2);
if (!catalogPath || !hierarchyPath) throw new Error("Indicare catalogo definitivo e gerarchia categorie");
const catalog = JSON.parse(readFileSync(catalogPath, "utf8")).rows;
const hierarchy = JSON.parse(readFileSync(hierarchyPath, "utf8"));
const [headers, ...rows] = catalog;
const records = rows.map(row => Object.fromEntries(headers.map((key, index) => [key, row[index]])));
const categories = new Map(hierarchy.Categorie.slice(1).map(([id, nome]) => [nome, id]));
const subcategories = new Map(hierarchy.Sottocategorie.slice(1).map(([id, categoryId, , nome, fase]) => [`${categoryId}|${nome}|${fase}`, id]));
const quote = value => value === null || value === undefined || value === "" ? "null" : `'${String(value).replaceAll("'", "''")}'`;
const boolean = value => value ? "true" : "false";

for (const record of records) {
  record.category_id = categories.get(record.categoria);
  record.subcategory_id = subcategories.get(`${record.category_id}|${record.sottocategoria}|${record.fase}`);
  if (!record.category_id || !record.subcategory_id) throw new Error(`Gerarchia non trovata per ${record.codice}: ${record.sottocategoria}`);
}

const values = records.map(record => `  (${[
  quote(record.codice), quote(record.nome), record.category_id, record.subcategory_id,
  quote(record.categoria), quote(record.sottocategoria), quote(record.fase), quote(record.obiettivo),
  quote(record.descrizione), record.durata_min, record.portieri_min, record.portieri_max,
  quote(record.intensita), record.difficolta, quote(record.materiale), quote(record.variante),
  quote(record.coaching_points), quote(record.errori_comuni), quote(record.schema_url),
  quote(record.foto_url), boolean(record.attivo),
].join(", ")})`).join(",\n");

const sql = `-- Standard definitivo Catalogo Esercizi e import prima categoria.
-- Import idempotente: codice è univoco e ON CONFLICT aggiorna senza duplicare.

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='exercises' and column_name='numero_portieri_min') then alter table public.exercises rename column numero_portieri_min to portieri_min; end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='exercises' and column_name='numero_portieri_max') then alter table public.exercises rename column numero_portieri_max to portieri_max; end if;
end $$;

-- Le colonne testuali della prima versione restano disponibili solo per
-- compatibilità storica, ma non devono bloccare nuovi esercizi.
alter table public.exercises alter column legacy_category drop not null;
alter table public.exercises alter column legacy_subcategory drop not null;

alter table public.exercises add column if not exists categoria text;
alter table public.exercises add column if not exists sottocategoria text;
alter table public.exercises add column if not exists fase text;
alter table public.exercises add column if not exists difficolta smallint not null default 1;
alter table public.exercises add column if not exists coaching_points text not null default '';
alter table public.exercises add column if not exists errori_comuni text not null default '';
alter table public.exercises add column if not exists schema_url text;
alter table public.exercises add column if not exists foto_url text;

update public.exercises e set
  categoria = c.nome,
  sottocategoria = s.nome,
  fase = s.fase
from public.exercise_categories c, public.exercise_subcategories s
where e.category_id = c.id and e.subcategory_id = s.id
  and (e.categoria is null or e.sottocategoria is null or e.fase is null);

alter table public.exercises alter column categoria set not null;
alter table public.exercises alter column sottocategoria set not null;
alter table public.exercises alter column fase set not null;
alter table public.exercises drop constraint if exists exercises_difficolta_check;
alter table public.exercises drop constraint if exists exercises_fase_check;
alter table public.exercises add constraint exercises_difficolta_check check (difficolta in (1, 2, 3));
alter table public.exercises add constraint exercises_fase_check check (fase in ('Analitico', 'Disturbo', 'Situazionale'));
create index if not exists exercises_catalog_filters_idx on public.exercises (categoria, sottocategoria, fase, intensita, difficolta, attivo);

insert into public.exercises (
  codice, nome, category_id, subcategory_id, categoria, sottocategoria, fase,
  obiettivo, descrizione, durata_min, portieri_min, portieri_max, intensita,
  difficolta, materiale, variante, coaching_points, errori_comuni,
  schema_url, foto_url, attivo
) values
${values}
on conflict (codice) do update set
  nome=excluded.nome,
  category_id=excluded.category_id,
  subcategory_id=excluded.subcategory_id,
  categoria=excluded.categoria,
  sottocategoria=excluded.sottocategoria,
  fase=excluded.fase,
  obiettivo=excluded.obiettivo,
  descrizione=excluded.descrizione,
  durata_min=excluded.durata_min,
  portieri_min=excluded.portieri_min,
  portieri_max=excluded.portieri_max,
  intensita=excluded.intensita,
  difficolta=excluded.difficolta,
  materiale=excluded.materiale,
  variante=excluded.variante,
  coaching_points=excluded.coaching_points,
  errori_comuni=excluded.errori_comuni,
  schema_url=excluded.schema_url,
  foto_url=excluded.foto_url,
  attivo=excluded.attivo;
`;

writeFileSync("supabase/migrations/0004_definitive_exercise_catalog.sql", sql, "utf8");
console.log(`Migrazione definitiva generata con ${records.length} esercizi univoci.`);
