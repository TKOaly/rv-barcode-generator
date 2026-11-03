import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test as base, expect } from "@playwright/test"
import { openCatalog } from "../server/database"
import { catalogServer } from "../server/http"
import { fixtureImages, initialCatalog } from "./fixture"

export const test = base.extend({
  baseURL: async ({}, use) => {
    const directory = mkdtempSync(join(tmpdir(), "rv-e2e-"))
    const db = openCatalog(join(directory, "catalog.sqlite"))
    db.migrateSchema()
    db.insertMissing(initialCatalog.products, fixtureImages)
    db.command({ kind: "rename", title: initialCatalog.title }, 0)
    const server = catalogServer(db)
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    if (!address || typeof address === "string")
      throw new Error("Missing server address")
    try {
      await use(`http://127.0.0.1:${address.port}`)
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close(error => (error ? reject(error) : resolve())),
      )
      db.close()
      rmSync(directory, { recursive: true })
    }
  },
})
export { expect }
