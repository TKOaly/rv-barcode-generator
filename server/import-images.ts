import { readFile, unlink } from 'node:fs/promises';
import { openCatalog, type CatalogDatabase } from './database';
import { normalizeImage, imageUrl } from './images';
import { imageSchema } from '../src/catalog';
import { pathToFileURL } from 'node:url';

export async function importProductImages(db: CatalogDatabase, root = 'public') {
  const updates: { id: string; previous: string; image: string }[] = [];
  const blobs: Awaited<ReturnType<typeof normalizeImage>>[] = [];
  const files = new Set<string>();
  for (const product of db.legacyProducts()) {
    if (imageSchema.safeParse(product.image).success) {
      if (!db.getImage(product.image.slice('/api/images/'.length))) throw new Error(`Missing stored image for ${product.id}. Restore a backup before retrying.`);
      continue;
    }
    if (!/^\/products\/[a-zA-Z0-9_-]+\.(png|jpe?g|webp)$/.test(product.image)) throw new Error(`Cannot migrate image for ${product.id}: ${product.image}`);
    const file = `${root}${product.image}`;
    const blob = await normalizeImage(await readFile(file));
    blobs.push(blob);
    updates.push({ id: product.id, previous: product.image, image: imageUrl(blob.id) });
    files.add(file);
  }
  const migrated = db.importImages(updates, blobs);
  const snapshot = db.read();
  for (const product of snapshot.catalog.products) if (!db.getImage(product.image.slice('/api/images/'.length))) throw new Error(`Image verification failed for ${product.id}`);
  for (const file of files) await unlink(file);
  return { products: snapshot.catalog.products.length, migrated, uniqueImages: new Set(snapshot.catalog.products.map(product => product.image)).size };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = openCatalog();
  try { process.stdout.write(`${JSON.stringify(await importProductImages(db))}\n`); } finally { db.close(); }
}
