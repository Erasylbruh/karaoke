'use client';

/**
 * Track covers: opening the picked file, cutting the chosen square out of it and storing the result.
 * Covers live in Supabase Storage as files; the karaoke keeps only the URL.
 */
import { uploadPublicFile } from './blob-store';

/** Side of the saved square: sharp in 1080p video and on high-density screens. */
export const COVER_SIZE = 768;

/** Pixel rectangle of the original image (what react-easy-crop reports as croppedAreaPixels). */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const isHeic = (file: File) => /image\/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);

/** True for anything the cover picker should try to open. */
export const looksLikeImage = (file: File) => file.type.startsWith('image/') || isHeic(file);

/**
 * Object URL of the picked file, once the browser has proved it can decode it. Throws an error
 * with a message for the person when it cannot (HEIC photos from an iPhone in most browsers).
 */
export async function openImageFile(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
    return url;
  } catch {
    URL.revokeObjectURL(url);
    throw new Error(
      isHeic(file)
        ? 'Этот браузер не открывает фото в формате HEIC. Сохраните картинку в JPG или PNG и загрузите снова.'
        : 'Не удалось открыть картинку. Сохраните её в JPG или PNG и загрузите снова.'
    );
  }
}

/** Cuts `rect` out of the image at `src` into a COVER_SIZE square JPEG. */
export async function cropToBlob(src: string, rect: CropRect): Promise<Blob> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = COVER_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas недоступен');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height, 0, 0, COVER_SIZE, COVER_SIZE);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Не удалось сохранить обложку'))), 'image/jpeg', 0.86)
  );
}

const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

/**
 * Stores a cover and returns what goes into `style.coverImage`: the public Supabase URL, or, when
 * the upload is refused (for example the bucket does not allow images yet), the picture inlined
 * as before, so the cover still works.
 */
export async function saveCover(blob: Blob): Promise<string> {
  try {
    return await uploadPublicFile(blob, 'covers');
  } catch (e) {
    console.warn('[cover] upload failed, keeping the cover inside the track:', e);
    return toDataUrl(blob);
  }
}
