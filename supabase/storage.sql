-- Run once in Supabase → SQL Editor.
-- Creates a public bucket "uploads" for karaoke audio, custom fonts and track covers.
-- Already ran an older version? Run only the "update" statement at the end of this file.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'uploads', 'uploads', true, 41943040,  -- 40 MB
  array['audio/*', 'font/*', 'application/font-woff', 'application/x-font-ttf', 'application/octet-stream',
        'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Sign-in is handled by Firebase, so Supabase sees every visitor as "anon".
-- The site lets only signed-in users open the editor, but at the API level anyone with the
-- public key can upload into this bucket. Fine for testing; for production, upload through a
-- Vercel API route that checks the Firebase ID token (see docs/DEPLOY.md).
create policy "uploads: anyone can upload"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'uploads');

-- Public bucket: files are readable by URL without a policy. No update/delete policies,
-- so uploaded files cannot be overwritten or removed with the public key.

-- Covers (added later): lets the bucket accept images. Safe to run more than once.
update storage.buckets
  set allowed_mime_types = array['audio/*', 'font/*', 'application/font-woff', 'application/x-font-ttf',
                                 'application/octet-stream', 'image/jpeg', 'image/png', 'image/webp']
  where id = 'uploads';
