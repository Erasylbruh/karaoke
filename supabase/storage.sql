-- Run in Supabase → SQL Editor.
-- Creates a public bucket "uploads" for karaoke audio, custom fonts and track covers.
-- Note: 'application/octet-stream' is intentionally excluded so arbitrary binaries cannot be uploaded.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'uploads', 'uploads', true, 41943040,  -- 40 MB
  array[
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave',
    'audio/ogg', 'audio/opus', 'audio/mp4', 'audio/x-m4a', 'audio/aac',
    'audio/flac', 'audio/x-flac', 'audio/webm',
    'font/ttf', 'font/otf', 'font/woff', 'font/woff2',
    'application/font-woff', 'application/font-woff2', 'application/x-font-ttf', 'application/x-font-opentype',
    'image/jpeg', 'image/png', 'image/webp'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- RECOMMENDED FOR PRODUCTION:
-- Set SUPABASE_SERVICE_ROLE_KEY in Vercel Environment Variables so the site uploads through
-- /api/storage/upload (which verifies the user's Firebase ID token and ban status).
-- Once SUPABASE_SERVICE_ROLE_KEY is configured, drop the direct anonymous upload policy:
--   drop policy if exists "uploads: anyone can upload" on storage.objects;

-- Fallback policy ONLY for local dev without SUPABASE_SERVICE_ROLE_KEY (restricts path structure):
drop policy if exists "uploads: anyone can upload" on storage.objects;
create policy "uploads: anyone can upload"
  on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] in ('audio', 'covers', 'fonts', 'uploads')
  );

-- Public bucket: files are readable by URL without a policy. No update/delete policies for anon,
-- so uploaded files cannot be overwritten or removed with the publishable key.
