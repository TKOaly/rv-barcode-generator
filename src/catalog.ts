import { z } from "zod"

export const categories = [
  { key: "0000000", label: "Pantit" },
  { key: "0000100", label: "Kahvi tee yms ei laskettu" },
  { key: "0000200", label: "Suklaat" },
  { key: "0000300", label: "Karkit" },
  { key: "0000400", label: "Keksit" },
  { key: "0000500", label: "Jäätelöt" },
  { key: "0000600", label: "Välipala/proteiini patukat" },
  { key: "0000700", label: "Puurot" },
  { key: "0000800", label: "varalla" },
  { key: "0000900", label: "Muut" },
] as const

export const categoryKeySchema = z.enum(
  categories.map(category => category.key),
)

export type CategoryKey = z.infer<typeof categoryKeySchema>

export function eanFromBase(base: string): string {
  if (!/^\d{7}$/.test(base)) throw new Error("Expected a seven-digit EAN base.")
  const sum = Array.from(base, Number).reduce(
    (sum, digit, index) => sum + digit * (index % 2 === 0 ? 3 : 1),
    0,
  )
  return `${base}${(10 - (sum % 10)) % 10}`
}

export function getCategory(ean: string) {
  const base = Number(ean.slice(0, 7))
  return categories.find(
    category =>
      base >= Number(category.key) && base < Number(category.key) + 100,
  )
}

export function nextCategoryEan(
  products: Array<Pick<Product, "ean">>,
  category: CategoryKey,
): string | undefined {
  const used = new Set(products.map(product => product.ean.slice(0, 7)))
  for (let base = Number(category); base < Number(category) + 100; base++) {
    const value = String(base).padStart(7, "0")
    if (!used.has(value)) return eanFromBase(value)
  }
  return undefined
}

export function isValidEan(value: string): boolean {
  if (!/^\d{8}$/.test(value)) return false
  const digits = Array.from(value, Number)
  return (
    digits.reduce(
      (sum, digit, index) => sum + digit * (index % 2 === 0 ? 3 : 1),
      0,
    ) %
      10 ===
    0
  )
}

export const imageSchema = z
  .string()
  .regex(/^\/api\/images\/[a-f0-9]{64}$/, "Upload a product photo.")

export const productSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(140),
  ean: z
    .string()
    .refine(
      isValidEan,
      "Enter a valid 8-digit EAN-8, including its check digit.",
    ),
  image: imageSchema,
  included: z.boolean().default(true),
})

export type Product = z.infer<typeof productSchema>

export const catalogSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    products: z.array(productSchema).max(500),
  })
  .refine(
    catalog =>
      new Set(catalog.products.map(product => product.id)).size ===
      catalog.products.length,
  )
  .refine(
    catalog =>
      new Set(catalog.products.map(product => product.ean)).size ===
      catalog.products.length,
    "EAN-8 barcodes must be unique.",
  )

export type Catalog = z.infer<typeof catalogSchema>

export const actionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("rename"),
    title: z.string().trim().min(1).max(80),
  }),
  z
    .object({
      kind: z.literal("create"),
      product: productSchema
        .omit({ ean: true })
        .extend({ id: z.uuid() })
        .strict(),
      category: categoryKeySchema,
    })
    .strict(),
  z.object({ kind: z.literal("save"), product: productSchema }),
  z.object({ kind: z.literal("remove"), id: z.string().min(1) }),
  z.object({
    kind: z.literal("set-included"),
    id: z.string().min(1),
    included: z.boolean(),
  }),
  z.object({
    kind: z.literal("move"),
    id: z.string().min(1),
    targetId: z.string().min(1),
  }),
  z.object({ kind: z.literal("restore"), catalog: catalogSchema }),
])

export type CatalogAction = z.infer<typeof actionSchema>

export const snapshotSchema = z.object({
  catalog: catalogSchema,
  revision: z.number().int().nonnegative(),
  previous: catalogSchema.optional(),
})

export const commandSchema = z.object({
  action: actionSchema,
  expectedRevision: z.number().int().nonnegative(),
})

export function updateCatalog(
  catalog: Catalog,
  action: CatalogAction,
): Catalog {
  switch (action.kind) {
    case "restore":
      return action.catalog
    case "rename":
      return { ...catalog, title: action.title }
    case "create": {
      if (catalog.products.some(product => product.id === action.product.id))
        throw new Error("Product already exists.")
      const ean = nextCategoryEan(catalog.products, action.category)
      if (!ean)
        throw new Error("This category is full. Choose another category.")
      return {
        ...catalog,
        products: [...catalog.products, { ...action.product, ean }],
      }
    }
    case "save": {
      const existing = catalog.products.find(
        product => product.id === action.product.id,
      )
      if (!existing) throw new Error("Product no longer exists.")
      if (existing.ean !== action.product.ean)
        throw new Error(
          "An existing product's barcode and category cannot change.",
        )
      return {
        ...catalog,
        products: catalog.products.map(product =>
          product.id === existing.id ? action.product : product,
        ),
      }
    }
    case "set-included":
      return {
        ...catalog,
        products: catalog.products.map(product =>
          product.id === action.id
            ? { ...product, included: action.included }
            : product,
        ),
      }
    case "remove":
      return {
        ...catalog,
        products: catalog.products.filter(p => p.id !== action.id),
      }
    case "move": {
      const from = catalog.products.findIndex(p => p.id === action.id)
      const to = catalog.products.findIndex(p => p.id === action.targetId)
      if (from < 0 || to < 0 || from === to) return catalog
      const products = [...catalog.products]
      const [product] = products.splice(from, 1)
      if (!product) return catalog
      products.splice(to, 0, product)
      return { ...catalog, products }
    }
  }
}

export function paginate(products: Array<Product>): Array<Array<Product>> {
  const included = products.filter(product => product.included)
  return Array.from(
    { length: Math.max(1, Math.ceil(included.length / 12)) },
    (_, index) => included.slice(index * 12, index * 12 + 12),
  )
}
