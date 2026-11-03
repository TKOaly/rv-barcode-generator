import { initialCatalog } from "../tests/fixture";
import { describe, expect, it } from "vitest";
import {
  catalogSchema,
  categories,
  getCategory,
  eanFromBase,
  nextCategoryEan,
  actionSchema,
  isValidEan,
  paginate,
  updateCatalog,
} from "./catalog";

describe("catalog behavior", () => {
  it("preserves the supplied order over two pages of twelve cards", () => {
    const pages = paginate(initialCatalog.products);
    expect(pages.map((page) => page.length)).toEqual([12, 2]);
    expect(pages.flat().map((product) => product.ean)).toEqual(
      initialCatalog.products.map((product) => product.ean),
    );
    expect(pages[1]?.[0]?.name).toBe("Naturli Cookie Dough 90g");
  });
  it("moves a product across a page boundary without duplicating or mutating", () => {
    const before = structuredClone(initialCatalog);
    const next = updateCatalog(initialCatalog, {
      kind: "move",
      id: "product-13",
      targetId: "product-0",
    });
    expect(next.products[0]?.ean).toBe("00005227");
    expect(new Set(next.products.map((p) => p.id)).size).toBe(14);
    expect(paginate(next.products)[1]?.map((p) => p.id)).toEqual([
      "product-11",
      "product-12",
    ]);
    expect(initialCatalog).toEqual(before);
  });
  it("ignores missing reorder targets and keeps an empty printable page", () => {
    expect(
      updateCatalog(initialCatalog, {
        kind: "move",
        id: "missing",
        targetId: "product-0",
      }),
    ).toBe(initialCatalog);
    expect(paginate([])).toEqual([[]]);
    expect(
      paginate(
        Array.from({ length: 24 }, () => initialCatalog.products[0]).filter(
          (p) => p !== undefined,
        ),
      ).map((p) => p.length),
    ).toEqual([12, 12]);
  });
  it("edits in place, creates by category, and removes by identity", () => {
    const product = initialCatalog.products[3];
    if (!product) throw new Error("Fixture missing");
    const edited = updateCatalog(initialCatalog, {
      kind: "save",
      product: { ...product, name: "Updated product" },
    });
    expect(edited.products[3]?.name).toBe("Updated product");
    const added = updateCatalog(edited, {
      kind: "create",
      product: { id: "ecf7c62a-399c-40b4-b5ca-b5e5175eef86", name: product.name, image: product.image, included: true },
      category: "0000200",
    });
    expect(added.products.at(-1)?.id).toBe("ecf7c62a-399c-40b4-b5ca-b5e5175eef86");
    expect(updateCatalog(added, { kind: "remove", id: "ecf7c62a-399c-40b4-b5ca-b5e5175eef86" })).toEqual(edited);
  });
  it("validates stored data and genuine EAN-8 checksums", () => {
    expect(initialCatalog.products.every((p) => isValidEan(p.ean))).toBe(true);
    expect(isValidEan("00002005")).toBe(false);
    expect(isValidEan("0000200")).toBe(false);
    expect(
      catalogSchema.safeParse({
        ...initialCatalog,
        products: [initialCatalog.products[0], initialCatalog.products[0]],
      }).success,
    ).toBe(false);
    expect(
      catalogSchema.safeParse({ title: "Bad", products: [{}] }).success,
    ).toBe(false);
  });
});

describe("category allocation", () => {
  it.each(categories)("allocates the range start for $label and all hundred valid codes", category => {
    const products: { ean: string }[] = [];
    for (let offset = 0; offset < 100; offset++) {
      const ean = nextCategoryEan(products, category.key);
      expect(ean).toBe(eanFromBase(String(Number(category.key) + offset).padStart(7, "0")));
      if (!ean) throw new Error("Missing code");
      expect(isValidEan(ean)).toBe(true);
      expect(getCategory(ean)).toEqual(category);
      products.push({ ean });
    }
    expect(nextCategoryEan(products, category.key)).toBeUndefined();
    products.splice(5, 1);
    expect(nextCategoryEan(products, category.key)).toBe(eanFromBase(String(Number(category.key) + 5).padStart(7, "0")));
  });
  it("uses the known check digit and reserves excluded products", () => {
    expect(eanFromBase("0000200")).toBe("00002004");
    expect(nextCategoryEan(initialCatalog.products.map(product => ({ ...product, included: false })), "0000200")).toBe(eanFromBase("0000201"));
    expect(getCategory(eanFromBase("9999999"))).toBeUndefined();
    expect(catalogSchema.safeParse({ title: "Legacy", products: [{ ...initialCatalog.products[0], ean: eanFromBase("9999999") }] }).success).toBe(true);
  });
  it("rejects duplicate codes, arbitrary creation through save, and barcode edits", () => {
    const product = initialCatalog.products[0];
    if (!product) throw new Error("Missing fixture");
    expect(catalogSchema.safeParse({ ...initialCatalog, products: [product, { ...product, id: "different" }] }).success).toBe(false);
    expect(() => updateCatalog(initialCatalog, { kind: "save", product: { ...product, id: "missing" } })).toThrow("no longer exists");
    expect(() => updateCatalog(initialCatalog, { kind: "save", product: { ...product, ean: eanFromBase("0000201") } })).toThrow("cannot change");
    expect(actionSchema.safeParse({ kind: "create", product, category: "0000200" }).success).toBe(false);
    expect(actionSchema.safeParse({ kind: "create", product: { ...product, ean: undefined }, category: "invalid" }).success).toBe(false);
  });
});
