import { openCatalog } from "./database"
import { seedArchive } from "./archive"

const args = process.argv.slice(2).filter(arg => arg !== "--")
if (args.length > 1) throw new Error("Usage: pnpm db:seed [archive.zip]")
const db = openCatalog()
try {
  process.stdout.write(
    `${JSON.stringify(await seedArchive(db, args[0] ?? "seed/CATALOG.zip"))}\n`,
  )
} finally {
  db.close()
}
