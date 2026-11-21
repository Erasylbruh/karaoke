-- Run in Supabase → SQL Editor. Safe to run again.
-- Public bucket "uploads" for karaoke audio, custom fonts, covers and avatars.
-- 'application/octet-stream' is intentionally excluded so arbitrary binaries cannot be uploaded.

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

-- Uploads go through /api/storage/upload: the route checks the Firebase ID token, a confirmed email
-- and bans, then hands out a one-time signed upload URL. That needs SUPABASE_SERVICE_ROLE_KEY in
-- Vercel (Project → Settings → Environment Variables). Deletions go through /api/storage/delete.
--
-- Once the key is set, the new code is deployed and an upload has been checked on the live site,
-- close direct anonymous uploads (run this line on its own):
--
--   drop policy if exists "uploads: anyone can upload" on storage.objects;
--
-- Public bucket: files are readable by URL without a policy. There are no update/delete policies,
-- so files cannot be overwritten or removed with the publishable key.
