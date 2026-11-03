import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { asc, eq } from 'drizzle-orm';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { actionSchema, catalogSchema, updateCatalog, type Catalog, type CatalogAction } from '../src/catalog';
import { metadata, products, images } from './schema';

export function openCatalog(path = process.env.DATABASE_PATH ?? 'data/catalog.sqlite') {
  mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('busy_timeout = 5000');
  const db = drizzle(sqlite);
  function read() {
    const meta = db.select().from(metadata).where(eq(metadata.id, 1)).get();
    if (!meta) throw new Error('Run pnpm db:migrate first.');
    return { catalog: catalogSchema.parse({ title: meta.title, products: db.select().from(products).orderBy(asc(products.position), asc(products.id)).all() }), revision: meta.revision };
  }
  function health() {
    const meta = db.select({ revision: metadata.revision }).from(metadata).where(eq(metadata.id, 1)).get();
    if (!meta) throw new Error('Catalog is not initialized.');
    return { status: 'ok', revision: meta.revision };
  }
  function requireImages(catalog: Catalog) {
    for (const product of catalog.products) if (!getImage(product.image.slice('/api/images/'.length))) throw new Error('Product photo does not exist. Upload it again.');
  }
  function getImage(id: string) { return db.select().from(images).where(eq(images.id, id)).get(); }
  function storeImage(image: typeof images.$inferInsert) { db.insert(images).values(image).onConflictDoNothing().run(); }
  function replace(catalog: Catalog) {
    requireImages(catalog);
    db.delete(products).run();
    for (const [position, product] of catalog.products.entries()) db.insert(products).values({ ...product, position }).run();
    db.update(metadata).set({ title: catalog.title }).where(eq(metadata.id, 1)).run();
  }
  function command(action: CatalogAction, expectedRevision: number) {
    action = actionSchema.parse(action);
    return sqlite.transaction(() => {
      const current = read();
      if (action.kind === 'restore' && expectedRevision !== current.revision) throw new Error('Catalog changed elsewhere. Reload before undoing.');
      replace(catalogSchema.parse(updateCatalog(current.catalog, action)));
      db.update(metadata).set({ revision: current.revision + 1 }).where(eq(metadata.id, 1)).run();
      return { ...read(), previous: current.catalog };
    }).immediate();
  }
  function migrateSchema() {
    migrate(db, { migrationsFolder: 'drizzle' });
    db.insert(metadata).values({ id: 1, title: 'Catalog', revision: 0 }).onConflictDoNothing().run();
  }
  function insertMissing(incoming: Catalog['products'], blobs: (typeof images.$inferInsert)[] = []) {
    return sqlite.transaction(() => {
      for (const blob of blobs) storeImage(blob);
      const current = read();
      const ids = new Set(current.catalog.products.map(p => p.id));
      const added = incoming.filter(p => !ids.has(p.id));
      catalogSchema.parse({ ...current.catalog, products: [...current.catalog.products, ...added] });
      requireImages({ ...current.catalog, products: added });
      added.forEach((product, index) => db.insert(products).values({ ...product, position: current.catalog.products.length + index }).run());
      if (added.length) db.update(metadata).set({ revision: current.revision + 1 }).where(eq(metadata.id, 1)).run();
      return added.length;
    }).immediate();
  }
  function legacyProducts() { return db.select().from(products).orderBy(asc(products.position)).all(); }
  function importImages(updates: { id: string; previous: string; image: string }[], blobs: (typeof images.$inferInsert)[]) {
    return sqlite.transaction(() => {
      for (const blob of blobs) storeImage(blob);
      for (const update of updates) {
        const row = db.select().from(products).where(eq(products.id, update.id)).get();
        if (!row || row.image !== update.previous) throw new Error('Catalog changed during image import. Retry.');
        if (!getImage(update.image.slice('/api/images/'.length))) throw new Error('Missing imported photo.');
        db.update(products).set({ image: update.image }).where(eq(products.id, update.id)).run();
      }
      if (updates.length) db.update(metadata).set({ revision: (db.select().from(metadata).where(eq(metadata.id, 1)).get()?.revision ?? 0) + 1 }).where(eq(metadata.id, 1)).run();
      return updates.length;
    }).immediate();
  }
  return { health, getImage, storeImage, legacyProducts, importImages, read, command, insertMissing, migrateSchema, close: () => sqlite.close() };
}
export type CatalogDatabase = ReturnType<typeof openCatalog>;
