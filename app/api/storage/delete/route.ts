import { deleteObjects } from '@/lib/server/storage';

/** Deletes the caller's own files (or any file, for admins) from Supabase Storage (see lib/server/storage.ts). */
export async function POST(request: Request) {
  return deleteObjects(request);
}
