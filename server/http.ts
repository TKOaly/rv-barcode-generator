import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { extname, resolve, sep } from "node:path"
import { commandSchema } from "../src/catalog"
import { imageUrl, maxImageBytes, normalizeImage } from "./images"
import { isAuthenticated, isLoginEnabled, login, logout } from "./auth"
import type { CatalogDatabase } from "./database"

export function catalogServer(db: CatalogDatabase) {
  const imageCacheControl = isLoginEnabled
    ? "private, max-age=31536000, immutable"
    : "public, max-age=31536000, immutable"

  return createServer(async (req, res) => {
    try {
      const path = new URL(req.url ?? "/", "http://localhost").pathname
      if (path.startsWith("/api/")) {
        res.setHeader("Content-Type", "application/json")
        res.setHeader("Cache-Control", "no-store")
        if (req.method === "GET" && path === "/api/health") {
          try {
            res.end(JSON.stringify(db.health()))
          } catch {
            res.writeHead(503).end(JSON.stringify({ status: "unavailable" }))
          }
          return
        }
        if (isLoginEnabled) {
          if (req.method === "POST" && path === "/api/login") {
            await login(req, res)
            return
          }
          if (req.method === "POST" && path === "/api/logout") {
            logout(req, res)
            return
          }
          if (!(await isAuthenticated(req))) {
            res.writeHead(401).end(JSON.stringify({ error: "Login required." }))
            return
          }
          if (req.method === "POST" && path === "/api/auth/session/") {
            res.writeHead(200).end(JSON.stringify({ ok: true }))
            return
          }
        }
        const imageMatch = /^\/api\/images\/([a-f0-9]{64})$/.exec(path)
        if (req.method === "GET" && imageMatch) {
          const image = db.getImage(imageMatch[1])
          if (!image) {
            res
              .writeHead(404)
              .end(JSON.stringify({ error: "Photo not found." }))
            return
          }
          const etag = `"${image.id}"`
          res.setHeader("Cache-Control", imageCacheControl)
          res.setHeader("ETag", etag)
          res.setHeader("Content-Type", image.mime)
          res.setHeader("X-Content-Type-Options", "nosniff")
          if (req.headers["if-none-match"] === etag) {
            res.writeHead(304).end()
            return
          }
          res.setHeader("Content-Length", image.bytes.length)
          res.end(image.bytes)
          return
        }
        if (req.method === "POST" && path === "/api/images") {
          if (Number(req.headers["content-length"]) > maxImageBytes)
            throw new Error("Photo must be at most 10 MiB.")
          const chunks: Array<Buffer> = []
          let size = 0
          for await (const chunk of req) {
            const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
            size += bytes.length
            if (size > maxImageBytes)
              throw new Error("Photo must be at most 10 MiB.")
            chunks.push(bytes)
          }
          const image = await normalizeImage(Buffer.concat(chunks))
          db.storeImage(image)
          res.writeHead(201).end(JSON.stringify({ image: imageUrl(image.id) }))
          return
        }
        if (req.method === "GET" && path === "/api/catalog") {
          res.end(JSON.stringify(db.read()))
          return
        }
        if (req.method === "POST" && path === "/api/catalog/commands") {
          let body = ""
          for await (const chunk of req) {
            body += chunk.toString()
            if (Buffer.byteLength(body) > 2_000_000)
              throw new Error("Request too large.")
          }
          const { action, expectedRevision } = commandSchema.parse(
            JSON.parse(body),
          )
          res.end(JSON.stringify(db.command(action, expectedRevision)))
          return
        }
        res.writeHead(404).end(JSON.stringify({ error: "Unknown API route." }))
        return
      }
      const root = resolve("dist")
      const file = resolve(root, `.${decodeURIComponent(path)}`)
      if (file !== root && !file.startsWith(root + sep)) {
        res.writeHead(403).end()
        return
      }
      const types: Record<string, string> = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".webp": "image/webp",
        ".png": "image/png",
        ".svg": "image/svg+xml",
      }
      try {
        const bytes = await readFile(file)
        res.setHeader(
          "Content-Type",
          types[extname(file)] ?? "application/octet-stream",
        )
        res.end(bytes)
      } catch {
        if (extname(path)) {
          res.writeHead(404).end()
          return
        }
        res.setHeader("Content-Type", "text/html")
        res.end(await readFile(resolve(root, "index.html")))
      }
    } catch (error) {
      res.writeHead(400, { "Content-Type": "application/json" }).end(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Request failed.",
        }),
      )
    }
  })
}
