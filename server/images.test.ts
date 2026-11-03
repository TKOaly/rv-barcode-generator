import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import sharp from "sharp"
import { expect, it } from "vitest"
import { eanFromBase, productSchema } from "../src/catalog"
import { openCatalog } from "./database"
import { catalogServer } from "./http"
import { imageUrl, maxImageBytes, normalizeImage } from "./images"
import { importProductImages } from "./import-images"

it("uploads actual EXIF JPEG, crops after rotation, serves immutable WebP, dedupes and rejects unsafe inputs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rv-images-"))
  const db = openCatalog(join(directory, "catalog.sqlite"))
  db.migrateSchema()
  const server = catalogServer(db)
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string")
    throw new Error("Missing address")
  const base = `http://127.0.0.1:${address.port}`
  try {
    const jpeg = await sharp({
      create: { width: 900, height: 300, channels: 3, background: "#1eaf38" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer()
    const post = (body: Buffer) =>
      fetch(`${base}/api/images`, {
        method: "POST",
        body: new Uint8Array(body),
      })
    const response = await post(jpeg)
    expect(response.status).toBe(201)
    const result = await response.json()
    const image = productSchema.shape.image.parse(result.image)
    const stored = db.getImage(image.slice("/api/images/".length))
    expect(stored).toMatchObject({
      width: 512,
      height: 512,
      mime: "image/webp",
    })
    const binary = await fetch(base + image)
    expect(binary.headers.get("content-type")).toBe("image/webp")
    expect(binary.headers.get("cache-control")).toContain("immutable")
    const bytes = Buffer.from(await binary.arrayBuffer())
    expect(bytes).toEqual(stored?.bytes)
    const metadata = await sharp(bytes).metadata()
    expect(metadata).toMatchObject({ format: "webp", width: 512, height: 512 })
    expect(metadata.exif).toBeUndefined()
    expect(bytes).toEqual(
      await sharp(jpeg)
        .rotate()
        .resize(512, 512, { fit: "cover", position: "centre" })
        .webp({ quality: 82 })
        .toBuffer(),
    )
    expect(
      (
        await fetch(base + image, {
          headers: { "If-None-Match": binary.headers.get("etag") ?? "" },
        })
      ).status,
    ).toBe(304)
    expect(await (await post(jpeg)).json()).toEqual({ image })
    for (const input of [
      Buffer.from("not a photo"),
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"/>',
      ),
      Buffer.alloc(maxImageBytes + 1),
    ])
      expect((await post(input)).status).toBe(400)
    const huge = await sharp({
      create: { width: 7000, height: 6000, channels: 3, background: "white" },
    })
      .png()
      .toBuffer()
    expect((await post(huge)).status).toBe(400)
    expect((await fetch(`${base}/api/images/${"0".repeat(64)}`)).status).toBe(
      404,
    )
    const product = {
      id: randomUUID(),
      name: "Uploaded photo",
      image,
      included: true,
    }
    db.command({ kind: "create", category: "0000200", product }, 0)
    const original = db.read().catalog.products[0]
    if (!original) throw new Error("Missing product")
    const replacement = await normalizeImage(
      await readFile("tests/assets/product-1.png"),
    )
    db.storeImage(replacement)
    db.command(
      {
        kind: "save",
        product: { ...original, image: imageUrl(replacement.id) },
      },
      1,
    )
    expect(db.getImage(image.slice("/api/images/".length))).toBeDefined()
    const before = db.read()
    expect(() =>
      db.command(
        {
          kind: "save",
          product: { ...original, image: `/api/images/${"0".repeat(64)}` },
        },
        before.revision,
      ),
    ).toThrow("does not exist")
    expect(db.read()).toEqual(before)
    expect(JSON.stringify(before)).not.toContain("bytes")
    for (const bad of ["https://example.com/a.png", "/products/a.webp"])
      expect(productSchema.shape.image.safeParse(bad).success).toBe(false)
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    db.close()
    await rm(directory, { recursive: true })
  }
})

it("migrates legacy local refs atomically, preserves product metadata, deletes runtime files and repeats unchanged", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rv-import-"))
  const path = join(directory, "catalog.sqlite")
  const db = openCatalog(path)
  db.migrateSchema()
  try {
    const { default: Database } = await import("better-sqlite3")
    const raw = new Database(path)
    raw
      .prepare(
        "INSERT INTO products (id,name,ean,image,included,position) VALUES (?,?,?,?,?,?)",
      )
      .run(
        "legacy",
        "Custom",
        eanFromBase("0000200"),
        "/products/legacy.png",
        0,
        17,
      )
    raw.close()
    await expect(importProductImages(db, directory)).rejects.toThrow()
    expect(db.legacyProducts()[0]?.image).toBe("/products/legacy.png")
    await mkdir(join(directory, "products"))
    await writeFile(
      join(directory, "products/legacy.png"),
      await readFile("tests/assets/product-0.png"),
    )
    expect(await importProductImages(db, directory)).toMatchObject({
      migrated: 1,
      products: 1,
      uniqueImages: 1,
    })
    expect(db.legacyProducts()[0]).toMatchObject({
      id: "legacy",
      name: "Custom",
      ean: eanFromBase("0000200"),
      included: false,
      position: 17,
    })
    await expect(
      access(join(directory, "products/legacy.png")),
    ).rejects.toThrow()
    const before = db.read()
    expect(await importProductImages(db, directory)).toMatchObject({
      migrated: 0,
    })
    expect(db.read()).toEqual(before)
  } finally {
    db.close()
    await rm(directory, { recursive: true })
  }
})
