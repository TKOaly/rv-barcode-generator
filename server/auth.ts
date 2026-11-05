import { jwtVerify } from "jose"
import type { IncomingMessage, ServerResponse } from "node:http"

const { API_URL, JWT_SECRET } = process.env
const secret = new TextEncoder().encode(JWT_SECRET ?? "")

export const isLoginEnabled = Boolean(API_URL && JWT_SECRET)

const verify = (token: string) =>
  jwtVerify(token, secret, { algorithms: ["HS256"] })

const send = (
  res: ServerResponse,
  status: number,
  body: unknown,
  cookie?: string,
) =>
  res
    .writeHead(status, cookie ? { "Set-Cookie": cookie } : {})
    .end(JSON.stringify(body))

const cookie = (value: string, age: number) =>
  `accessToken=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${age}`

export async function isAuthenticated(req: IncomingMessage) {
  const token = /accessToken=([^;]+)/.exec(req.headers.cookie ?? "")?.[1]
  return Boolean(token && (await verify(token).catch(() => null)))
}

export function sameOrigin(req: IncomingMessage) {
  const { origin, host } = req.headers
  return !origin || origin.split("//")[1] === host
}

async function isAdmin(token: string) {
  const res = await fetch(`${API_URL}/api/v1/user`, {
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => null)
  if (!res?.ok) return false
  const data = (await res.json().catch(() => null)) as {
    user?: { role?: string }
  } | null
  return data?.user?.role === "ADMIN"
}

export async function login(req: IncomingMessage, res: ServerResponse) {
  let body = ""
  for await (const chunk of req) {
    body += chunk
    if (body.length > 10_000) throw new Error("Request too large.")
  }
  const { username, password } = JSON.parse(body)

  const upstream = await fetch(`${API_URL}/api/v2/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  }).catch(() => null)
  if (!upstream) return send(res, 502, { error: "Login service unavailable." })
  if (!upstream.ok)
    return send(res, 401, { error: "Wrong username or password." })

  const data = (await upstream.json().catch(() => null)) as {
    accessToken?: string
  } | null
  const token = data?.accessToken
  const verified = token ? await verify(token).catch(() => null) : null
  if (!token || !verified)
    return send(res, 502, { error: "Login service returned an invalid token." })
  if (!(await isAdmin(token)))
    return send(res, 403, { error: "Admin access required." })

  const age = (verified.payload.exp ?? 0) - Math.floor(Date.now() / 1000)
  send(res, 200, { ok: true }, cookie(token, Math.max(age, 0)))
}

export function logout(_req: IncomingMessage, res: ServerResponse) {
  send(res, 200, { ok: true }, cookie("", 0))
}
