import { openCatalog } from "./database"
import { catalogServer } from "./http"

const db = openCatalog()
db.read()
const server = catalogServer(db)
server.listen(
  Number(process.env.API_PORT ?? 3001),
  process.env.API_HOST ?? "127.0.0.1",
)
function shutdown() {
  server.close(() => {
    db.close()
    process.exit(0)
  })
}
process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)
