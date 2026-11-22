-- ONLY for a development project without SUPABASE_SERVICE_ROLE_KEY. Never run on production.
--
-- Lets anyone with the publishable key upload into the bucket (the old direct upload in
-- lib/blob-store.ts, used only when /api/storage/upload answers 501). Path structure is limited to
-- {audio|covers|fonts|uploads}/{uid}/{name}, but the uid is not checked, so this is open to abuse.

drop policy if exists "uploads: anyone can upload" on storage.objects;
create policy "uploads: anyone can upload"
  on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] in ('audio', 'covers', 'fonts', 'uploads')
  );
