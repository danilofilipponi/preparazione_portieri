create extension if not exists "pgcrypto";

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  category text not null,
  subcategory text not null,
  objective text not null,
  description text not null default '',
  duration_minutes integer not null check (duration_minutes > 0),
  min_goalkeepers integer not null default 1 check (min_goalkeepers > 0),
  max_goalkeepers integer not null default 1 check (max_goalkeepers >= min_goalkeepers),
  intensity smallint not null check (intensity between 1 and 3),
  equipment text not null default '',
  variation text,
  image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trainings (
  id uuid primary key default gen_random_uuid(),
  training_date date not null,
  planned_duration_minutes integer not null check (planned_duration_minutes > 0),
  goalkeeper_count integer not null check (goalkeeper_count > 0),
  notes text,
  status text not null default 'planned' check (status in ('planned', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.training_objectives (
  training_id uuid not null references public.trainings(id) on delete cascade,
  objective text not null,
  primary key (training_id, objective)
);

create table public.training_exercises (
  id uuid primary key default gen_random_uuid(),
  training_id uuid not null references public.trainings(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  position integer not null check (position >= 0),
  planned_duration_minutes integer not null check (planned_duration_minutes > 0),
  notes text,
  unique (training_id, position)
);

create index exercises_compatibility_idx on public.exercises (category, min_goalkeepers, max_goalkeepers);
create index exercises_objective_idx on public.exercises (objective);
create index trainings_date_idx on public.trainings (training_date);
create index training_exercises_training_idx on public.training_exercises (training_id, position);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger exercises_set_updated_at before update on public.exercises
for each row execute function public.set_updated_at();
create trigger trainings_set_updated_at before update on public.trainings
for each row execute function public.set_updated_at();

alter table public.exercises enable row level security;
alter table public.trainings enable row level security;
alter table public.training_objectives enable row level security;
alter table public.training_exercises enable row level security;

-- Policy adatte alla prima versione senza autenticazione. Prima di aprire l'app
-- a più utenti, sostituirle con policy basate su auth.uid() e proprietà dei record.
create policy "public exercises access" on public.exercises for all to anon, authenticated using (true) with check (true);
create policy "public trainings access" on public.trainings for all to anon, authenticated using (true) with check (true);
create policy "public training objectives access" on public.training_objectives for all to anon, authenticated using (true) with check (true);
create policy "public training exercises access" on public.training_exercises for all to anon, authenticated using (true) with check (true);

insert into storage.buckets (id, name, public)
values ('exercise-images', 'exercise-images', true)
on conflict (id) do nothing;

create policy "public exercise images read" on storage.objects for select to public using (bucket_id = 'exercise-images');
create policy "public exercise images upload" on storage.objects for insert to anon, authenticated with check (bucket_id = 'exercise-images');
create policy "public exercise images update" on storage.objects for update to anon, authenticated using (bucket_id = 'exercise-images') with check (bucket_id = 'exercise-images');
create policy "public exercise images delete" on storage.objects for delete to anon, authenticated using (bucket_id = 'exercise-images');
