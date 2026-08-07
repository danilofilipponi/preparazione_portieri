-- Bucket pubblico e policy idempotenti per le immagini del Catalogo Esercizi.
insert into storage.buckets (id, name, public)
values ('exercise-images', 'exercise-images', true)
on conflict (id) do update set public = true;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'public exercise images read') then
    create policy "public exercise images read" on storage.objects for select to public using (bucket_id = 'exercise-images');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'public exercise images upload') then
    create policy "public exercise images upload" on storage.objects for insert to anon, authenticated with check (bucket_id = 'exercise-images');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'public exercise images update') then
    create policy "public exercise images update" on storage.objects for update to anon, authenticated using (bucket_id = 'exercise-images') with check (bucket_id = 'exercise-images');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'public exercise images delete') then
    create policy "public exercise images delete" on storage.objects for delete to anon, authenticated using (bucket_id = 'exercise-images');
  end if;
end $$;
