/**
 * Files a track keeps in Supabase Storage (audio, cover, custom font, background) and their removal
 * when the track is deleted, so a deleted or taken-down track does not stay downloadable by URL.
 */
import type { Karaoke } from './types';
import { deleteCloudFiles, isCloudFileUrl } from './blob-store';
import { getKaraokes } from './storage';

type TrackLike = Pick<Karaoke, 'id' | 'audioUrl'> & { style?: Partial<Karaoke['style']> };

export function trackFileUrls(k: TrackLike): string[] {
  return [k.audioUrl, k.style?.coverImage, k.style?.fontFile, k.style?.backgroundImage].filter(isCloudFileUrl);
}

/**
 * Deletes the track's files that no other loaded track still uses (one font file can serve several
 * tracks). Resolves to the number of deleted files; throws when the server refuses.
 */
export async function deleteTrackFiles(k: TrackLike): Promise<number> {
  const urls = trackFileUrls(k);
  if (urls.length === 0) return 0;
  const usedElsewhere = new Set(
    getKaraokes()
      .filter((other) => other.id !== k.id && other.status !== 'deleted')
      .flatMap((other) => trackFileUrls(other))
  );
  const own = urls.filter((u) => !usedElsewhere.has(u));
  if (own.length === 0) return 0;
  const { deleted } = await deleteCloudFiles(own);
  return deleted;
}
