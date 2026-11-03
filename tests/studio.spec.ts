import { PDFDocument } from "pdf-lib"
import { expect, test } from "./setup"

test("search, filter, edit, reorder, add, delete, and persist", async ({
  page,
}) => {
  await page.goto("/")
  await expect(page.getByTestId("product-row")).toHaveCount(14)
  await page.getByLabel("Search products").fill("00002004")
  await expect(page.getByTestId("product-row")).toHaveCount(1)
  await page.getByRole("button", { name: "Clear search" }).click()
  await page
    .getByRole("button", { name: "Edit KitKat MINI 16,7g", exact: true })
    .click()
  await expect(page.getByLabel("EAN-8 barcode")).toHaveValue("00002004")
  await expect(page.getByLabel("EAN-8 barcode")).toHaveAttribute("readonly", "")
  await expect(page.getByLabel("Category", { exact: true })).toHaveValue(
    "Suklaat",
  )
  await expect(page.getByLabel("Category", { exact: true })).toHaveAttribute(
    "readonly",
    "",
  )
  await page
    .getByLabel("Product name", { exact: true })
    .fill("KitKat for the office")
  await page.getByRole("button", { name: "Save changes" }).click()
  await expect(
    page.getByRole("button", { name: "KitKat for the office", exact: true }),
  ).toBeVisible()
  await page.getByRole("button", { name: "Add product", exact: true }).click()
  await page.getByLabel("Product name", { exact: true }).fill("Test chocolate")
  await page
    .getByLabel("Product photo", { exact: true })
    .setInputFiles("tests/assets/product-0.png")
  await expect(page.locator("dialog button[type=submit]")).toBeEnabled()
  await page.getByLabel("Category", { exact: true }).selectOption("0000200")
  await expect(page.getByLabel("EAN-8 barcode")).toHaveValue("00002011")
  await expect(page.getByLabel("EAN-8 barcode")).toHaveAttribute("readonly", "")
  await page
    .getByRole("button", { name: "Add product", exact: true })
    .last()
    .click()
  await expect(page.getByTestId("product-row")).toHaveCount(15)
  await expect(page.getByTestId("product-row").last()).toContainText("00002011")
  await expect(
    page
      .locator(".preview-panel")
      .getByRole("img", { name: "EAN-8 00002011", exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Print catalog", exact: true }),
  ).toBeEnabled()
  await page.reload()
  await expect(page.getByTestId("product-row")).toHaveCount(15)
  await expect(
    page
      .locator(".preview-panel")
      .getByRole("img", { name: "EAN-8 00002011", exact: true }),
  ).toBeVisible()
  await expect(
    page
      .getByTestId("product-row")
      .filter({ hasText: "KitKat for the office" }),
  ).toContainText("00002004")
  await page
    .getByRole("button", { name: "Delete Test chocolate", exact: true })
    .click()
  await expect(page.getByTestId("product-row")).toHaveCount(14)
})

test("all preview pages scroll and print opens directly with two PDF pages", async ({
  page,
  context,
}) => {
  await page.goto("/")
  await expect(page.locator(".preview-panel .catalog-paper")).toHaveCount(2)
  await expect(page.locator(".preview-panel .product-card")).toHaveCount(14)
  await page.evaluate(() =>
    Promise.all(Array.from(document.images).map(image => image.decode())),
  )
  await page.evaluate(() => {
    window.print = () => {
      document.body.dataset.printRequested = "true"
    }
  })
  await page.getByRole("button", { name: "Print catalog" }).click()
  await expect(page.locator("body")).toHaveAttribute(
    "data-print-requested",
    "true",
  )
  expect(context.pages()).toHaveLength(1)
  await page.emulateMedia({ media: "print" })
  await expect(page.locator(".split-layout")).toBeHidden()
  await expect(page.locator(".studio-print-pages")).toBeVisible()
  const pdfBytes = await page.pdf({
    path: "test-results/catalog.pdf",
    preferCSSPageSize: true,
    printBackground: true,
  })
  const pdf = await PDFDocument.load(pdfBytes)
  expect(pdf.getPageCount()).toBe(2)
  for (const sheet of pdf.getPages()) {
    expect(sheet.getWidth()).toBeCloseTo(841.89, 0)
    expect(sheet.getHeight()).toBeCloseTo(595.28, 0)
  }
  await page.emulateMedia({ media: "screen" })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  const canvas = page.locator(".preview-canvas")
  expect(
    await canvas.evaluate(
      element => element.scrollHeight > element.clientHeight,
    ),
  ).toBe(true)
  await canvas.evaluate(element => {
    element.scrollTop = element.scrollHeight
  })
  await expect(
    page.locator(".preview-panel .catalog-paper").last(),
  ).toBeInViewport()
})

test("preview dragging reorders within a page and across pages", async ({
  page,
}) => {
  await page.goto("/")
  const cards = page.locator(".preview-panel .product-card")
  const drag = async (from: number, to: number) => {
    const source = await cards.nth(from).boundingBox()
    const target = await cards.nth(to).boundingBox()
    if (!source || !target) throw new Error("Preview cards unavailable")
    await page.mouse.move(
      source.x + source.width / 2,
      source.y + source.height / 2,
    )
    await page.mouse.down()
    await page.mouse.move(
      source.x + source.width / 2 + 8,
      source.y + source.height / 2,
      { steps: 3 },
    )
    await page.mouse.move(
      target.x + target.width / 2,
      target.y + target.height / 2,
      { steps: 20 },
    )
    await expect(cards.nth(to)).toHaveClass(/drop-target/)
    await expect(cards.nth(to)).toHaveCSS(
      "background-color",
      "rgb(219, 234, 254)",
    )
    await page.mouse.up()
    await expect(page.locator(".preview-panel .drop-target")).toHaveCount(0)
  }
  await drag(0, 1)
  await expect(cards.first()).toContainText("Tölkin palautus")
  await drag(1, 12)
  await expect(cards.nth(12)).toContainText("Pullon palautus -0,10€")
  await expect(page.getByTestId("product-row").nth(12)).toContainText(
    "Pullon palautus -0,10€",
  )
  await expect(
    page.getByRole("button", { name: "Print catalog", exact: true }),
  ).toBeEnabled()
  await page.reload()
  await expect(cards.nth(12)).toContainText("Pullon palautus -0,10€")
})

test("browser storage cannot overwrite the database", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.setItem("rv-catalog-v1", "{broken"))
  await expect(
    page.getByRole("button", { name: "Print catalog", exact: true }),
  ).toBeEnabled()
  await page.reload()
  await expect(page.getByTestId("product-row")).toHaveCount(14)
})

test("minimal split layout has no decorative chrome", async ({ page }) => {
  await page.goto("/")
  await expect(
    page.locator(
      "header, footer, h1, h2, h3, .toast, .save-status, svg:not(.card-details svg)",
    ),
  ).toHaveCount(0)
  await expect(
    page
      .locator(".management button")
      .filter({ hasText: /^(Move|Up|Down|Undo)$/ }),
  ).toHaveCount(0)
  const left = await page
    .getByRole("region", { name: "Manage products" })
    .boundingBox()
  const right = await page
    .getByRole("region", { name: "Live preview" })
    .boundingBox()
  expect(left && right && left.x + left.width <= right.x + 1).toBeTruthy()
  await page.setViewportSize({ width: 390, height: 844 })
  const top = await page
    .getByRole("region", { name: "Manage products" })
    .boundingBox()
  const bottom = await page
    .getByRole("region", { name: "Live preview" })
    .boundingBox()
  expect(top && bottom && top.y + top.height <= bottom.y + 1).toBeTruthy()
  await page.getByRole("button", { name: "Add product", exact: true }).click()
  await expect(page.locator("dialog h2, dialog svg")).toHaveCount(0)
})

test("include toggles persist, preserve edits, and repaginate preview and print", async ({
  page,
}) => {
  await page.goto("/")
  const names = [
    "Pullon palautus -0,10€",
    "Tölkin palautus -0,15€",
    "Pullon palautus -0,20€",
  ]
  for (const name of names)
    await page
      .getByRole("checkbox", { name: `Include ${name}`, exact: true })
      .uncheck()
  await expect(page.getByTestId("product-row")).toHaveCount(14)
  await expect(page.locator(".preview-panel .product-card")).toHaveCount(11)
  await expect(page.locator(".preview-panel .catalog-paper")).toHaveCount(1)
  await expect(page.locator(".studio-print-pages .product-card")).toHaveCount(
    11,
  )
  await page
    .getByRole("button", { name: "Edit Pullon palautus -0,10€", exact: true })
    .click()
  await page.getByRole("button", { name: "Save changes" }).click()
  await expect(
    page.getByRole("button", { name: "Print catalog", exact: true }),
  ).toBeEnabled()
  await page.reload()
  await expect(
    page.getByRole("checkbox", {
      name: "Include Pullon palautus -0,10€",
      exact: true,
    }),
  ).not.toBeChecked()
  await expect(page.locator(".preview-panel .product-card")).toHaveCount(11)
  await page
    .getByRole("checkbox", {
      name: "Include Pullon palautus -0,10€",
      exact: true,
    })
    .check()
  await expect(
    page.locator(".preview-panel .product-card").first(),
  ).toContainText("Pullon palautus -0,10€")
  await page
    .getByRole("checkbox", {
      name: "Include Pullon palautus -0,10€",
      exact: true,
    })
    .uncheck()
  await expect(
    page.getByRole("button", { name: "Print catalog", exact: true }),
  ).toBeEnabled()
  await page.goto("/print")
  await expect(page.locator(".product-card")).toHaveCount(11)
})

test("dialog inclusion survives a database reload", async ({ page }) => {
  await page.goto("/")
  await page
    .getByRole("button", { name: "Edit KitKat MINI 16,7g", exact: true })
    .click()
  await page
    .getByRole("checkbox", { name: "Include in catalog", exact: true })
    .uncheck()
  await page.getByRole("button", { name: "Save changes", exact: true }).click()
  await expect(
    page.getByRole("button", { name: "Print catalog", exact: true }),
  ).toBeEnabled()
  await page.reload()
  await expect(
    page.getByRole("checkbox", {
      name: "Include KitKat MINI 16,7g",
      exact: true,
    }),
  ).not.toBeChecked()
})

test("a failed initial read never sends a snapshot write", async ({ page }) => {
  const writes: Array<string> = []
  page.on("request", request => {
    if (request.method() === "POST") writes.push(request.url())
  })
  await page.route("**/api/catalog", route => route.abort())
  await page.goto("/")
  await expect(page.getByRole("alert")).toContainText("Could not load")
  await expect(
    page.getByRole("button", { name: "Add product", exact: true }),
  ).toHaveCount(0)
  expect(writes).toEqual([])
})

test("a failed save is visible and stops further writes", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("product-row")).toHaveCount(14)
  await page.route("**/api/catalog/commands", route =>
    route.fulfill({ status: 500, body: "{}" }),
  )
  await page
    .getByRole("checkbox", { name: "Include KitKat MINI 16,7g", exact: true })
    .click()
  await expect(page.getByRole("alert")).toContainText("Could not save")
  await expect(
    page.getByRole("checkbox", {
      name: "Include KitKat MINI 16,7g",
      exact: true,
    }),
  ).toBeChecked()
  await page.unroute("**/api/catalog/commands")
  await page.reload()
  await expect(
    page.getByRole("checkbox", {
      name: "Include KitKat MINI 16,7g",
      exact: true,
    }),
  ).toBeChecked()
})

test("category filter combines with search and leaves preview order intact", async ({
  page,
}) => {
  await page.goto("/")
  await page.getByLabel("Filter category").selectOption("0000500")
  await expect(page.getByTestId("product-row")).toHaveCount(5)
  await expect(page.getByTestId("product-row").first()).toContainText(
    "Jäätelöt",
  )
  await expect(page.locator(".preview-panel .product-card")).toHaveCount(14)
  await page.getByLabel("Search products").fill("Mars")
  await expect(page.getByTestId("product-row")).toHaveCount(1)
  await page.getByRole("button", { name: "Clear search" }).click()
  await page.getByLabel("Filter category").selectOption("0000200")
  await expect(page.getByTestId("product-row")).toHaveCount(1)
  await expect(page.getByTestId("product-row")).toContainText("KitKat")
  await page.getByLabel("Filter category").selectOption("")
  await expect(page.getByTestId("product-row")).toHaveCount(14)
})

test("a full category shows a dialog error and disables creation", async ({
  page,
  request,
}) => {
  const { snapshotSchema, eanFromBase } = await import("../src/catalog")
  const snapshot = snapshotSchema.parse(
    await (await request.get("/api/catalog")).json(),
  )
  const product = snapshot.catalog.products[0]
  if (!product) throw new Error("Missing fixture")
  const response = await request.post("/api/catalog/commands", {
    data: {
      expectedRevision: snapshot.revision,
      action: {
        kind: "restore",
        catalog: {
          ...snapshot.catalog,
          products: [
            ...snapshot.catalog.products,
            ...Array.from({ length: 99 }, (_, index) => ({
              ...product,
              id: `occupied-${index}`,
              ean: eanFromBase(String(201 + index).padStart(7, "0")),
              included: false,
            })),
          ],
        },
      },
    },
  })
  expect(response.ok()).toBe(true)
  const errors: Array<string> = []
  page.on("pageerror", error => errors.push(error.message))
  await page.goto("/")
  await page.getByRole("button", { name: "Add product", exact: true }).click()
  await page.getByLabel("Category", { exact: true }).selectOption("0000200")
  await expect(page.getByRole("alert")).toContainText("category is full")
  await expect(
    page
      .locator("dialog")
      .getByRole("button", { name: "Add product", exact: true }),
  ).toBeDisabled()
  await page
    .getByLabel("Product photo", { exact: true })
    .setInputFiles("tests/assets/product-0.png")
  await page.getByLabel("Category", { exact: true }).selectOption("0000300")
  await expect(page.getByRole("alert")).toHaveCount(0)
  await expect(
    page
      .locator("dialog")
      .getByRole("button", { name: "Add product", exact: true }),
  ).toBeEnabled()
  expect(errors).toEqual([])
})

test("concurrent exhaustion rolls back the optimistic create and shows the server error", async ({
  page,
  request,
}) => {
  const { snapshotSchema, eanFromBase } = await import("../src/catalog")
  await page.goto("/")
  await expect(page.getByTestId("product-row")).toHaveCount(14)
  await page.getByRole("button", { name: "Add product", exact: true }).click()
  await page.getByLabel("Category", { exact: true }).selectOption("0000200")
  await page
    .getByLabel("Product name", { exact: true })
    .fill("Should not persist")
  await page
    .getByLabel("Product photo", { exact: true })
    .setInputFiles("tests/assets/product-0.png")
  await expect(page.locator("dialog button[type=submit]")).toBeEnabled()
  const snapshot = snapshotSchema.parse(
    await (await request.get("/api/catalog")).json(),
  )
  const product = snapshot.catalog.products[0]
  if (!product) throw new Error("Missing fixture")
  expect(
    (
      await request.post("/api/catalog/commands", {
        data: {
          expectedRevision: snapshot.revision,
          action: {
            kind: "restore",
            catalog: {
              ...snapshot.catalog,
              products: [
                ...snapshot.catalog.products,
                ...Array.from({ length: 99 }, (_, index) => ({
                  ...product,
                  id: `occupied-${index}`,
                  ean: eanFromBase(String(201 + index).padStart(7, "0")),
                  included: false,
                })),
              ],
            },
          },
        },
      })
    ).ok(),
  ).toBe(true)
  await page
    .locator("dialog")
    .getByRole("button", { name: "Add product", exact: true })
    .click()
  await expect(page.getByRole("alert")).toContainText("category is full")
  await expect(page.getByTestId("product-row")).toHaveCount(113)
  await expect(
    page.getByRole("button", { name: "Should not persist", exact: true }),
  ).toHaveCount(0)
  await page.reload()
  await expect(page.getByTestId("product-row")).toHaveCount(113)
})

test("photo upload is required, replacement persists, and failures leave the existing photo intact", async ({
  page,
  request,
}) => {
  await page.goto("/")
  await page.getByRole("button", { name: "Add product", exact: true }).click()
  await page.getByLabel("Product name", { exact: true }).fill("Photo required")
  await expect(page.locator("dialog button[type=submit]")).toBeDisabled()
  await expect(
    page.locator("dialog input[type=url], .image-picker"),
  ).toHaveCount(0)
  await page.getByRole("button", { name: "Cancel", exact: true }).click()
  await page
    .getByRole("button", { name: "Edit KitKat MINI 16,7g", exact: true })
    .click()
  const old = await page
    .getByAltText("Selected product photo")
    .getAttribute("src")
  await page.route("**/api/images", route =>
    route.fulfill({ status: 400, json: { error: "Invalid photo." } }),
  )
  await page
    .getByLabel("Product photo", { exact: true })
    .setInputFiles("tests/assets/product-1.png")
  await expect(page.getByRole("alert")).toContainText("Invalid photo")
  await expect(page.getByAltText("Selected product photo")).toHaveAttribute(
    "src",
    old ?? "",
  )
  await page.unroute("**/api/images")
  await page
    .getByLabel("Product photo", { exact: true })
    .setInputFiles("tests/assets/product-2.png")
  await expect(page.locator("dialog button[type=submit]")).toBeEnabled()
  await page.getByRole("button", { name: "Save changes", exact: true }).click()
  await expect(
    page.getByRole("button", { name: "Print catalog", exact: true }),
  ).toBeEnabled()
  await page.reload()
  await page
    .getByRole("button", { name: "Edit KitKat MINI 16,7g", exact: true })
    .click()
  const replacement = await page
    .getByAltText("Selected product photo")
    .getAttribute("src")
  expect(replacement).toMatch(/^\/api\/images\/[a-f0-9]{64}$/)
  expect(replacement).not.toBe(old)
  expect((await request.get(replacement ?? "")).headers()["content-type"]).toBe(
    "image/webp",
  )
})

test("an older upload response cannot replace a newer selected photo", async ({
  page,
  request,
}) => {
  const catalog = await (await request.get("/api/catalog")).json()
  const oldImage = catalog.catalog.products[0].image
  let release = () => {}
  const held = new Promise<void>(resolve => {
    release = resolve
  })
  let started = false
  let first = true
  await page.route("**/api/images", async route => {
    if (!first) {
      await route.continue()
      return
    }
    first = false
    started = true
    await held
    await route
      .fulfill({ status: 201, json: { image: oldImage } })
      .catch(() => {})
  })
  await page.goto("/")
  await page
    .getByRole("button", { name: "Edit KitKat MINI 16,7g", exact: true })
    .click()
  await page
    .getByLabel("Product photo", { exact: true })
    .setInputFiles("tests/assets/product-0.png")
  await expect.poll(() => started).toBe(true)
  await expect(page.locator("dialog button[type=submit]")).toBeDisabled()
  const uploaded = await request.post("/api/images", {
    data: await (
      await import("node:fs/promises")
    ).readFile("tests/assets/product-3.png"),
  })
  const expected = (await uploaded.json()).image
  await page
    .getByLabel("Product photo", { exact: true })
    .setInputFiles("tests/assets/product-3.png")
  await expect(page.locator("dialog button[type=submit]")).toBeEnabled()
  release()
  await page.getByRole("button", { name: "Save changes", exact: true }).click()
  await expect(
    page.getByRole("button", { name: "Print catalog", exact: true }),
  ).toBeEnabled()
  const saved = await (await request.get("/api/catalog")).json()
  expect(
    saved.catalog.products.find(
      (product: { id: string }) => product.id === "product-6",
    ).image,
  ).toBe(expected)
})
