import { readFileSync, writeFileSync } from "node:fs";

const source = process.argv[2];
if (!source) throw new Error("Indicare il file catalog.json generato dall’analisi Excel");
const catalog = JSON.parse(readFileSync(source, "utf8"));
const categories = catalog.Categorie.slice(1);
const subcategories = catalog.Sottocategorie.slice(1);
const quote = value => `'${String(value).replaceAll("'", "''")}'`;

const categoryValues = categories.map(([id, nome]) => `  (${id}, ${quote(nome)})`).join(",\n");
const subcategoryValues = subcategories.map(([id, categoryId, , nome, fase]) => `  (${id}, ${categoryId}, ${quote(nome)}, ${quote(fase)})`).join(",\n");

const sql = `-- Catalogo tecnico ufficiale importato da catalogo_portieri_struttura_import.xlsx
-- Migrazione conservativa: mantiene id esercizi e riferimenti delle sedute esistenti.
-- Le vecchie colonne testuali vengono conservate come legacy_category/legacy_subcategory.

create table public.exercise_categories (
  id integer primary key,
  nome text not null unique,
  attivo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.exercise_subcategories (
  id integer primary key,
  category_id integer not null references public.exercise_categories(id) on update cascade on delete restrict,
  nome text not null,
  fase text not null check (fase in ('Analitico', 'Disturbo', 'Situazionale', 'Generale')),
  attivo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, nome),
  unique (id, category_id)
);

create trigger exercise_categories_set_updated_at before update on public.exercise_categories
for each row execute function public.set_updated_at();
create trigger exercise_subcategories_set_updated_at before update on public.exercise_subcategories
for each row execute function public.set_updated_at();

insert into public.exercise_categories (id, nome) values
${categoryValues}
on conflict (id) do update set nome = excluded.nome, attivo = true;

insert into public.exercise_subcategories (id, category_id, nome, fase) values
${subcategoryValues}
on conflict (id) do update set category_id = excluded.category_id, nome = excluded.nome, fase = excluded.fase, attivo = true;

alter table public.exercises add column if not exists category_id integer;
alter table public.exercises add column if not exists subcategory_id integer;
alter table public.exercises add column if not exists attivo boolean not null default true;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='exercises' and column_name='code') then alter table public.exercises rename column code to codice; end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='exercises' and column_name='name') then alter table public.exercises rename column name to nome; end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='exercises' and column_name='objective') then alter table public.exercises rename column objective to obiettivo; end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='exercises' and column_name='description') then alter table public.exercises rename column description to descrizione; end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='exercises' and column_name='duration_minutes') then alter table public.exercises rename column duration_minutes to durata_min; end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='exercises' and column_name='min_goalkeepers') then alter table public.exercises rename column min_goalkeepers to numero_portieri_min; end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='exercises' and column_name='max_goalkeepers') then alter table public.exercises rename column max_goalkeepers to numero_portieri_max; end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='exercises' and column_name='intensity') then alter table public.exercises rename column intensity to intensita; end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='exercises' and column_name='equipment') then alter table public.exercises rename column equipment to materiale; end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='exercises' and column_name='variation') then alter table public.exercises rename column variation to variante; end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='exercises' and column_name='image_path') then alter table public.exercises rename column image_path to immagine_url; end if;
end $$;

alter table public.exercises drop constraint if exists exercises_intensity_check;
alter table public.exercises alter column intensita type text using (
  case intensita::text
    when '1' then 'Bassa' when '2' then 'Media' when '3' then 'Alta'
    when 'Bassa' then 'Bassa' when 'Media' then 'Media' when 'Alta' then 'Alta'
    else 'Media'
  end
);

-- Classificazione conservativa degli 8 esercizi già presenti.
update public.exercises set category_id=1, subcategory_id=1 where codice='TEC-001';
update public.exercises set category_id=2, subcategory_id=19 where codice='TEC-014';
update public.exercises set category_id=4, subcategory_id=43 where codice in ('RAP-004','RAP-009');
update public.exercises set category_id=5, subcategory_id=55 where codice='POD-007';
update public.exercises set category_id=6, subcategory_id=67 where codice='POD-012';
update public.exercises set category_id=6, subcategory_id=75 where codice='SIT-011';
update public.exercises set category_id=3, subcategory_id=41 where codice='SIT-018';

-- Eventuali esercizi aggiunti nel frattempo sono preservati in Tema libero.
update public.exercises set category_id=12, subcategory_id=139 where category_id is null or subcategory_id is null;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='exercises' and column_name='category') then alter table public.exercises rename column category to legacy_category; end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='exercises' and column_name='subcategory') then alter table public.exercises rename column subcategory to legacy_subcategory; end if;
end $$;

alter table public.exercises alter column category_id set not null;
alter table public.exercises alter column subcategory_id set not null;
alter table public.exercises add constraint exercises_category_fk foreign key (category_id) references public.exercise_categories(id) on update cascade on delete restrict;
alter table public.exercises add constraint exercises_subcategory_category_fk foreign key (subcategory_id, category_id) references public.exercise_subcategories(id, category_id) on update cascade on delete restrict;
alter table public.exercises add constraint exercises_intensita_check check (intensita in ('Bassa', 'Media', 'Alta'));

create index exercises_catalog_idx on public.exercises (category_id, subcategory_id, attivo);
create index exercise_subcategories_filters_idx on public.exercise_subcategories (category_id, fase, attivo);

alter table public.exercise_categories enable row level security;
alter table public.exercise_subcategories enable row level security;
create policy "public exercise categories access" on public.exercise_categories for all to anon, authenticated using (true) with check (true);
create policy "public exercise subcategories access" on public.exercise_subcategories for all to anon, authenticated using (true) with check (true);
`;

writeFileSync("supabase/migrations/0003_official_exercise_catalog.sql", sql, "utf8");
console.log(`Migrazione generata: ${categories.length} categorie, ${subcategories.length} sottocategorie.`);
