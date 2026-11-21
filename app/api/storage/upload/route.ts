import { signUpload } from '@/lib/server/storage';

/** Issues a signed upload URL for Supabase Storage after checking the account (see lib/server/storage.ts). */
export async function POST(request: Request) {
  return signUpload(request);
}
