import { openCatalog } from "./database"

const db = openCatalog()
try {
  db.migrateSchema()
} finally {
  db.close()
}
