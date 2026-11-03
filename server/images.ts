import sharp from 'sharp';
import { createHash } from 'node:crypto';
import type { images } from './schema';

export const maxImageBytes = 10 * 1024 * 1024;
export async function normalizeImage(input: Buffer): Promise<typeof images.$inferInsert> {
  if (!input.length || input.length > maxImageBytes) throw new Error('Photo must be at most 10 MiB.');
  const decoder = sharp(input, { limitInputPixels: 40_000_000, failOn: 'warning' });
  const metadata = await decoder.metadata();
  if (!metadata.format || !['jpeg', 'png', 'webp', 'gif', 'tiff', 'avif', 'heif'].includes(metadata.format) || (metadata.pages ?? 1) > 1) throw new Error('Upload a single raster photo such as JPEG, PNG, or WebP.');
  const bytes = await decoder.rotate().resize(512, 512, { fit: 'cover', position: 'centre' }).webp({ quality: 82 }).toBuffer();
  return { id: createHash('sha256').update(bytes).digest('hex'), bytes, width: 512, height: 512, mime: 'image/webp' };
}
export function imageUrl(id: string) { return `/api/images/${id}`; }
