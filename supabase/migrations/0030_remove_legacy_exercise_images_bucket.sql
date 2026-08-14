begin;

drop policy if exists "exercise images public read" on storage.objects;
drop policy if exists "exercise images authenticated upload" on storage.objects;
drop policy if exists "exercise images authenticated update" on storage.objects;
drop policy if exists "exercise images authenticated delete" on storage.objects;

-- Compatibility cleanup for installations that still retain the original names.
drop policy if exists "public exercise images read" on storage.objects;
drop policy if exists "public exercise images upload" on storage.objects;
drop policy if exists "public exercise images update" on storage.objects;
drop policy if exists "public exercise images delete" on storage.objects;

commit;
