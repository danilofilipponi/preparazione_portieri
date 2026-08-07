-- Catalogo tecnico ufficiale importato da catalogo_portieri_struttura_import.xlsx
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
  (1, 'Tecnica presa alta e rasoterra'),
  (2, 'Tuffi laterali e reattività'),
  (3, 'Uscite basse 1vs1'),
  (4, 'Reattività con ostacoli e tuffi'),
  (5, 'Uscite alte su cross'),
  (6, 'Tecnica piede'),
  (7, 'Parate ravvicinate'),
  (8, 'Situazioni miste / combo tuffi'),
  (9, 'Match Simulation'),
  (10, 'Tecnica 1vs1 / copertura angoli'),
  (11, 'Posizionamento porta'),
  (12, 'Tema libero')
on conflict (id) do update set nome = excluded.nome, attivo = true;

insert into public.exercise_subcategories (id, category_id, nome, fase) values
  (1, 1, 'Presa alta analitica', 'Analitico'),
  (2, 1, 'Presa alta analitica 2', 'Analitico'),
  (3, 1, 'Presa rasoterra analitica', 'Analitico'),
  (4, 1, 'Presa rasoterra analitica 2', 'Analitico'),
  (5, 1, 'Presa con rimbalzo analitica', 'Analitico'),
  (6, 1, 'Presa con rimbalzo analitica 2', 'Analitico'),
  (7, 1, 'Presa alta con disturbo', 'Disturbo'),
  (8, 1, 'Presa alta con disturbo 2', 'Disturbo'),
  (9, 1, 'Presa rasoterra con disturbo', 'Disturbo'),
  (10, 1, 'Presa rasoterra con disturbo 2', 'Disturbo'),
  (11, 1, 'Presa con rimbalzo con disturbo', 'Disturbo'),
  (12, 1, 'Presa con rimbalzo con disturbo 2', 'Disturbo'),
  (13, 1, 'Presa alta situazionale', 'Situazionale'),
  (14, 1, 'Presa alta situazionale 2', 'Situazionale'),
  (15, 1, 'Presa rasoterra situazionale', 'Situazionale'),
  (16, 1, 'Presa rasoterra situazionale 2', 'Situazionale'),
  (17, 1, 'Presa rimbalzo situazionale', 'Situazionale'),
  (18, 1, 'Presa rimbalzo situazionale 2', 'Situazionale'),
  (19, 2, 'Tuffi laterali analitico', 'Analitico'),
  (20, 2, 'Tuffi laterali analitico 2', 'Analitico'),
  (21, 2, 'Tuffi attacco palla analitico', 'Analitico'),
  (22, 2, 'Tuffi attacco palla analitico 2', 'Analitico'),
  (23, 2, 'Tuffi laterali disturbo', 'Disturbo'),
  (24, 2, 'Tuffi laterali disturbo 2', 'Disturbo'),
  (25, 2, 'Tuffi attacco palla disturbo', 'Disturbo'),
  (26, 2, 'Tuffi attacco palla disturbo 2', 'Disturbo'),
  (27, 2, 'Tuffi laterali situazionale', 'Situazionale'),
  (28, 2, 'Tuffi laterali situazionale 2', 'Situazionale'),
  (29, 2, 'Tuffi attacco palla situazionale', 'Situazionale'),
  (30, 2, 'Tuffi attacco palla situazionale 2', 'Situazionale'),
  (31, 3, 'Uscite basse analitico', 'Analitico'),
  (32, 3, 'Uscite basse analitico 2', 'Analitico'),
  (33, 3, '1 vs 1 analitico', 'Analitico'),
  (34, 3, '1 vs 1 analitico 2', 'Analitico'),
  (35, 3, 'Uscite basse disturbo', 'Disturbo'),
  (36, 3, 'Uscite basse disturbo 2', 'Disturbo'),
  (37, 3, '1 vs 1 disturbo', 'Disturbo'),
  (38, 3, '1 vs 1 disturbo 2', 'Disturbo'),
  (39, 3, 'Uscite basse situazionale', 'Situazionale'),
  (40, 3, 'Uscite basse situazionale 2', 'Situazionale'),
  (41, 3, '1 vs 1 situazionale', 'Situazionale'),
  (42, 3, '1 vs 1 situazionale 2', 'Situazionale'),
  (43, 4, 'Reattività analitico', 'Analitico'),
  (44, 4, 'Reattività analitico 2', 'Analitico'),
  (45, 4, 'Stimoli colore analitico', 'Analitico'),
  (46, 4, 'Stimoli colore analitico 2', 'Analitico'),
  (47, 4, 'Reattività disturbo', 'Disturbo'),
  (48, 4, 'Reattività disturbo 2', 'Disturbo'),
  (49, 4, 'Stimoli colore disturbo', 'Disturbo'),
  (50, 4, 'Stimoli colore disturbo 2', 'Disturbo'),
  (51, 4, 'Reattività situazionale', 'Situazionale'),
  (52, 4, 'Reattività situazionale 2', 'Situazionale'),
  (53, 4, 'Stimoli colore situazionale', 'Situazionale'),
  (54, 4, 'Stimoli colore situazionale 2', 'Situazionale'),
  (55, 5, 'Uscite alte presa analitico', 'Analitico'),
  (56, 5, 'Uscite alte presa analitico 2', 'Analitico'),
  (57, 5, 'Lettura traiettorie analitico', 'Analitico'),
  (58, 5, 'Lettura traiettorie analitico 2', 'Analitico'),
  (59, 5, 'Uscite alte presa disturbo', 'Disturbo'),
  (60, 5, 'Uscite alte presa disturbo 2', 'Disturbo'),
  (61, 5, 'Lettura traiettorie disturbo', 'Disturbo'),
  (62, 5, 'Lettura traiettorie disturbo 2', 'Disturbo'),
  (63, 5, 'Uscite alte presa situazionale', 'Situazionale'),
  (64, 5, 'Uscite alte presa situazionale 2', 'Situazionale'),
  (65, 5, 'Lettura traiettorie situazionale', 'Situazionale'),
  (66, 5, 'Lettura traiettorie situazionale 2', 'Situazionale'),
  (67, 6, 'Trasmissione palla analitico', 'Analitico'),
  (68, 6, 'Trasmissione palla analitico 2', 'Analitico'),
  (69, 6, 'Rinvii analitico', 'Analitico'),
  (70, 6, 'Rinvii analitico 2', 'Analitico'),
  (71, 6, 'Trasmissione palla disturbo', 'Disturbo'),
  (72, 6, 'Trasmissione palla disturbo 2', 'Disturbo'),
  (73, 6, 'Rinvii disturbo', 'Disturbo'),
  (74, 6, 'Rinvii disturbo 2', 'Disturbo'),
  (75, 6, 'Trasmissione palla situazionale', 'Situazionale'),
  (76, 6, 'Trasmissione palla situazionale 2', 'Situazionale'),
  (77, 6, 'Rinvii situazionale', 'Situazionale'),
  (78, 6, 'Rinvii situazionale 2', 'Situazionale'),
  (79, 7, 'Leva gamba analitico', 'Analitico'),
  (80, 7, 'Leva gamba analitico 2', 'Analitico'),
  (81, 7, 'Controtempo analitico', 'Analitico'),
  (82, 7, 'Controtempo analitico 2', 'Analitico'),
  (83, 7, 'Leva gamba disturbo', 'Disturbo'),
  (84, 7, 'Leva gamba disturbo 2', 'Disturbo'),
  (85, 7, 'Controtempo disturbo', 'Disturbo'),
  (86, 7, 'Controtempo disturbo 2', 'Disturbo'),
  (87, 7, 'Leva gamba situazionale', 'Situazionale'),
  (88, 7, 'Leva gamba situazionale 2', 'Situazionale'),
  (89, 7, 'Controtempo situazionale', 'Situazionale'),
  (90, 7, 'Controtempo situazionale 2', 'Situazionale'),
  (91, 8, 'Parata in recupero analitico', 'Analitico'),
  (92, 8, 'Parata in recupero analitico 2', 'Analitico'),
  (93, 8, 'Parata in attacco tiro analitico', 'Analitico'),
  (94, 8, 'Parata in attacco tiro analitico 2', 'Analitico'),
  (95, 8, 'Parata in recupero disturbo', 'Disturbo'),
  (96, 8, 'Parata in recupero disturbo 2', 'Disturbo'),
  (97, 8, 'Parata in attacco tiro disturbo', 'Disturbo'),
  (98, 8, 'Parata in attacco tiro disturbo 2', 'Disturbo'),
  (99, 8, 'Parata in recupero situazionale', 'Situazionale'),
  (100, 8, 'Parata in recupero situazionale 2', 'Situazionale'),
  (101, 8, 'Parata in attacco tiro situazionale', 'Situazionale'),
  (102, 8, 'Parata in attacco tiro situazionale 2', 'Situazionale'),
  (103, 9, 'Palla a scavalcare analitico', 'Analitico'),
  (104, 9, 'Palla a scavalcare analitico 2', 'Analitico'),
  (105, 9, 'Punizioni e respinte analitico', 'Analitico'),
  (106, 9, 'Rigori analitico', 'Analitico'),
  (107, 9, 'Barriera e posizione analitico', 'Analitico'),
  (108, 9, 'Palla a scavalcare disturbo', 'Disturbo'),
  (109, 9, 'Palla a scavalcare disturbo 2', 'Disturbo'),
  (110, 9, 'Palla a scavalcare situazionale', 'Situazionale'),
  (111, 9, 'Palla a scavalcare situazionale 2', 'Situazionale'),
  (112, 9, 'Punizioni e respinte situazionale', 'Situazionale'),
  (113, 9, 'Rigori situazionale', 'Situazionale'),
  (114, 9, 'Barriera e posizione situazionale', 'Situazionale'),
  (115, 10, 'Copertura primo palo analitico', 'Analitico'),
  (116, 10, 'Copertura primo palo analitico 2', 'Analitico'),
  (117, 10, 'Cross bassi analitico', 'Analitico'),
  (118, 10, 'Cross bassi analitico 2', 'Analitico'),
  (119, 10, 'Copertura primo palo disturbo', 'Disturbo'),
  (120, 10, 'Copertura primo palo disturbo 2', 'Disturbo'),
  (121, 10, 'Cross bassi disturbo', 'Disturbo'),
  (122, 10, 'Cross bassi disturbo 2', 'Disturbo'),
  (123, 10, 'Copertura primo palo situazionale', 'Situazionale'),
  (124, 10, 'Copertura primo palo situazionale 2', 'Situazionale'),
  (125, 10, 'Cross bassi situazionale', 'Situazionale'),
  (126, 10, 'Cross bassi situazionale 2', 'Situazionale'),
  (127, 11, 'Posizione dx/sx analitico', 'Analitico'),
  (128, 11, 'Posizione dx/sx analitico 2', 'Analitico'),
  (129, 11, 'Posizione avanti/dietro analitico', 'Analitico'),
  (130, 11, 'Posizione avanti/dietro analitico 2', 'Analitico'),
  (131, 11, 'Posizione dx/sx disturbo', 'Disturbo'),
  (132, 11, 'Posizione dx/sx disturbo 2', 'Disturbo'),
  (133, 11, 'Posizione avanti/dietro disturbo', 'Disturbo'),
  (134, 11, 'Posizione avanti/dietro disturbo 2', 'Disturbo'),
  (135, 11, 'Posizione dx/sx situazionale', 'Situazionale'),
  (136, 11, 'Posizione dx/sx situazionale 2', 'Situazionale'),
  (137, 11, 'Posizione avanti/dietro situazionale', 'Situazionale'),
  (138, 11, 'Posizione avanti/dietro situazionale 2', 'Situazionale'),
  (139, 12, 'Attacco palla / porta / spazio', 'Generale'),
  (140, 12, 'Split step', 'Generale'),
  (141, 12, 'Posizione di attesa', 'Generale')
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
