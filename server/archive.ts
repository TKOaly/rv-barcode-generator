import AdmZip from "adm-zip"
import { decode } from "he"
import { catalogSchema, eanFromBase, productSchema } from "../src/catalog"
import { imageUrl, normalizeImage } from "./images"
import type { Product } from "../src/catalog"
import type { CatalogDatabase } from "./database"

export async function readArchive(path: string) {
  const zip = new AdmZip(path)
  const entries = zip.getEntries()
  const names = new Set<string>()
  for (const entry of entries) {
    const name = entry.entryName
    if (
      name.startsWith("/") ||
      name.includes("\\") ||
      name.split("/").some(part => part === ".." || part === ".") ||
      /^[A-Za-z]:/.test(name)
    )
      throw new Error(`Unsafe archive path ${name}`)
    if (names.has(name)) throw new Error(`Duplicate archive entry ${name}`)
    names.add(name)
  }
  const result: Array<{
    product: Product
    blob: Awaited<ReturnType<typeof normalizeImage>>
    archived: boolean
  }> = []
  const codes = new Set<string>()
  for (const entry of entries) {
    const match = /^CATALOG\/(VANHAT\/)?(\d{7})\.txt$/.exec(entry.entryName)
    if (!match) continue
    const code = match[2]
    if (codes.has(code)) throw new Error(`Duplicate product ${code}`)
    codes.add(code)
    const base = entry.entryName.slice(0, -4)
    const webp = zip.getEntry(`${base}.webp`)
    const svg = zip.getEntry(`${base}.svg`)
    if (!webp || !svg) throw new Error(`Incomplete product ${base}`)
    const ean = eanFromBase(code)
    const svgCode = [
      ...svg
        .getData()
        .toString("utf8")
        .matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g),
    ]
      .map(m => m[1].trim())
      .join("")
      .replace(/\s/g, "")
    if (svgCode !== ean)
      throw new Error(`Barcode mismatch for ${base}: ${svgCode} != ${ean}`)
    const bytes = webp.getData()
    if (
      bytes.toString("ascii", 0, 4) !== "RIFF" ||
      bytes.toString("ascii", 8, 12) !== "WEBP"
    )
      throw new Error(`Invalid WebP ${base}`)
    const blob = await normalizeImage(bytes)
    const product = productSchema.parse({
      id: `ean-${ean}`,
      name: decode(entry.getData().toString("utf8"))
        .replace(/\u00ad/g, "")
        .trim(),
      ean,
      image: imageUrl(blob.id),
      included: !match[1],
    })
    result.push({ product, blob, archived: Boolean(match[1]) })
  }
  for (const entry of entries) {
    const match = /^CATALOG\/(?:VANHAT\/)?(\d{7})\.webp$/.exec(entry.entryName)
    if (match && !codes.has(match[1]))
      throw new Error(`Missing product name for ${entry.entryName}`)
  }
  if (!result.length) throw new Error("Archive contains no products.")
  catalogSchema.parse({
    title: "Catalog",
    products: result.map(entry => entry.product),
  })
  return result.sort(
    (a, b) =>
      Number(a.archived) - Number(b.archived) ||
      a.product.ean.localeCompare(b.product.ean),
  )
}
export async function seedArchive(db: CatalogDatabase, path: string) {
  const entries = await readArchive(path)
  const inserted = db.insertMissing(
    entries.map(entry => entry.product),
    entries.map(entry => entry.blob),
  )
  return {
    active: entries.filter(entry => !entry.archived).length,
    archived: entries.filter(entry => entry.archived).length,
    inserted,
  }
}
