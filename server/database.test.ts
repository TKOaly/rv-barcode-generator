import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { randomUUID } from "node:crypto"
import { afterEach, describe, expect, it } from "vitest"
import AdmZip from "adm-zip"
import { eanFromBase, isValidEan } from "../src/catalog"
import { fixtureImages, initialCatalog } from "../tests/fixture"
import { openCatalog } from "./database"
import { readArchive, seedArchive } from "./archive"
import { catalogServer } from "./http"

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
})
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "rv-db-"))
  const db = openCatalog(join(directory, "catalog.sqlite"))
  db.migrateSchema()
  fixtureImages.forEach(db.storeImage)
  cleanups.push(() => {
    db.close()
    rmSync(directory, { recursive: true })
  })
  return { db, directory }
}
describe("SQLite catalog and archive seed", () => {
  it("imports every real product with SQLite photos and preserves custom images, edits, inclusion, and order on rerun", async () => {
    const { db } = fixture()
    expect(await seedArchive(db, "seed/CATALOG.zip")).toEqual({
      active: 14,
      archived: 29,
      inserted: 43,
    })
    const original = db.read()
    expect(original.catalog.products.filter(p => p.included)).toHaveLength(14)
    expect(
      original.catalog.products.some(
        p => p.name.includes("&shy;") || p.name.includes("\u00ad"),
      ),
    ).toBe(false)
    const first = original.catalog.products[0]
    const last = original.catalog.products.at(-1)
    if (!first || !last) throw new Error("Missing imported product")
    expect(
      db.getImage(first.image.slice("/api/images/".length))?.bytes.length,
    ).toBeGreaterThan(0)
    db.command(
      {
        kind: "save",
        product: {
          ...first,
          name: "Edited",
          included: false,
          image: initialCatalog.products[0]?.image ?? first.image,
        },
      },
      original.revision,
    )
    db.command(
      { kind: "move", id: last.id, targetId: first.id },
      db.read().revision,
    )
    const edited = db.read()
    expect((await seedArchive(db, "seed/CATALOG.zip")).inserted).toBe(0)
    expect(db.read()).toEqual(edited)
    expect(db.read().catalog.products[0]?.id).toBe(last.id)
    expect(
      db.read().catalog.products.find(p => p.id === first.id),
    ).toMatchObject({
      name: "Edited",
      included: false,
      image: initialCatalog.products[0]?.image,
    })
  }, 30_000)
  it("validates the whole archive before any database or asset mutation", async () => {
    const { db, directory } = fixture()
    const zip = new AdmZip("seed/CATALOG.zip")
    zip.updateFile("CATALOG/0000000.txt", Buffer.from(""))
    const bad = join(directory, "bad.zip")
    zip.writeZip(bad)
    await expect(seedArchive(db, bad)).rejects.toThrow()
    expect(db.read().catalog.products).toEqual([])
    const unsafe = new AdmZip()
    unsafe.addFile("../outside.txt", Buffer.from("not executable"))
    unsafe.writeZip(bad)
    await expect(readArchive(bad)).rejects.toThrow()
  })
  it("rolls back invalid commands and rejects a stale undo", () => {
    const { db } = fixture()
    db.insertMissing(initialCatalog.products)
    const before = db.read()
    db.command({ kind: "rename", title: "Other client" }, before.revision)
    expect(() =>
      db.command({ kind: "restore", catalog: before.catalog }, before.revision),
    ).toThrow("changed elsewhere")
    expect(() => db.command({ kind: "rename", title: "" }, 1)).toThrow()
    expect(db.read().catalog.title).toBe("Other client")
    expect(db.read().catalog.products).toHaveLength(14)
  })
  it("serializes simultaneous API commands without losing independently added rows", async () => {
    const { db } = fixture()
    const server = catalogServer(db)
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    if (!address || typeof address === "string")
      throw new Error("Missing address")
    try {
      const health = await fetch(`http://127.0.0.1:${address.port}/api/health`)
      expect(health.status).toBe(200)
      expect(await health.json()).toEqual({ status: "ok", revision: 0 })
      const responses = await Promise.all(
        initialCatalog.products.map(product =>
          fetch(`http://127.0.0.1:${address.port}/api/catalog/commands`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: {
                kind: "create",
                category: "0000200",
                product: {
                  id: randomUUID(),
                  name: product.name,
                  image: product.image,
                  included: product.included,
                },
              },
              expectedRevision: 0,
            }),
          }),
        ),
      )
      expect(responses.every(r => r.ok)).toBe(true)
      expect(db.read().catalog.products).toHaveLength(14)
      expect(db.read().revision).toBe(14)
      const healthAfter = await fetch(
        `http://127.0.0.1:${address.port}/api/health`,
      )
      expect(await healthAfter.json()).toEqual({ status: "ok", revision: 14 })
      const codes = db.read().catalog.products.map(product => product.ean)
      expect(new Set(codes).size).toBe(14)
      expect(codes.every(isValidEan)).toBe(true)
      expect(codes).toEqual(
        Array.from({ length: 14 }, (_, index) =>
          eanFromBase(String(200 + index).padStart(7, "0")),
        ),
      )
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })
})

it("rejects exhaustion atomically, including simultaneous HTTP creates for the last slot", async () => {
  const { db } = fixture()
  const product = initialCatalog.products[0]
  if (!product) throw new Error("Missing fixture")
  db.insertMissing(
    Array.from({ length: 99 }, (_, index) => ({
      ...product,
      id: `full-${index}`,
      ean: eanFromBase(String(200 + index).padStart(7, "0")),
      included: false,
    })),
  )
  const server = catalogServer(db)
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string")
    throw new Error("Missing address")
  try {
    const responses = await Promise.all(
      [0, 1].map(() =>
        fetch(`http://127.0.0.1:${address.port}/api/catalog/commands`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: {
              kind: "create",
              category: "0000200",
              product: {
                id: randomUUID(),
                name: "Last slot",
                image: product.image,
                included: true,
              },
            },
            expectedRevision: 1,
          }),
        }),
      ),
    )
    expect(responses.map(response => response.status).sort()).toEqual([
      200, 400,
    ])
    expect(db.read().catalog.products).toHaveLength(100)
    expect(db.read().revision).toBe(2)
    expect(db.read().catalog.products.at(-1)?.ean).toBe(eanFromBase("0000299"))
    const before = db.read()
    expect(() =>
      db.command(
        {
          kind: "create",
          category: "0000200",
          product: {
            id: randomUUID(),
            name: "Overflow",
            image: product.image,
            included: true,
          },
        },
        2,
      ),
    ).toThrow("full")
    expect(db.read()).toEqual(before)
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
