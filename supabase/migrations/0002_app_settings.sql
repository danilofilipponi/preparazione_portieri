create table public.app_settings (
  id text primary key default 'default' check (id = 'default'),
  coach_name text not null default 'Marco Rossi',
  account_email text not null default '',
  phone text,
  role text not null default 'Preparatore portieri',
  club_name text not null default '',
  team_name text not null default 'Prima squadra',
  season text not null default '2026/27',
  training_location text,
  default_duration_minutes integer not null default 60 check (default_duration_minutes > 0),
  default_goalkeeper_count integer not null default 3 check (default_goalkeeper_count > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger app_settings_set_updated_at before update on public.app_settings
for each row execute function public.set_updated_at();

alter table public.app_settings enable row level security;
create policy "public app settings access" on public.app_settings
for all to anon, authenticated using (true) with check (true);

insert into public.app_settings (id)
values ('default')
on conflict (id) do nothing;
