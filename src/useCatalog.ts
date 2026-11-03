import { useCallback, useEffect, useRef, useState } from "react"
import { snapshotSchema, updateCatalog } from "./catalog"
import type { Catalog, CatalogAction } from "./catalog"

async function request(action?: CatalogAction, revision = 0) {
  const response = await fetch(
    action ? "/api/catalog/commands" : "/api/catalog",
    action
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, expectedRevision: revision }),
        }
      : undefined,
  )
  if (!response.ok) {
    const failure: unknown = await response.json().catch(() => null)
    const detail =
      failure &&
      typeof failure === "object" &&
      "error" in failure &&
      typeof failure.error === "string"
        ? ` ${failure.error}`
        : ""
    throw new Error(
      `Could not save the catalog.${detail} Reload before editing again.`,
    )
  }
  return snapshotSchema.parse(await response.json())
}
export function useCatalog() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [history, setHistory] = useState<Array<Catalog>>([])
  const [error, setError] = useState("")
  const [pending, setPending] = useState(0)
  const current = useRef<Catalog | null>(null)
  const historyRef = useRef<Array<Catalog>>([])
  const revision = useRef(0)
  const queue = useRef(Promise.resolve())
  const failed = useRef(false)
  const sequence = useRef(0)
  useEffect(() => {
    let active = true
    request()
      .then(snapshot => {
        if (!active) return
        revision.current = snapshot.revision
        current.current = snapshot.catalog
        setCatalog(snapshot.catalog)
      })
      .catch(() => {
        if (active)
          setError("Could not load the catalog. Check the server and reload.")
      })
    return () => {
      active = false
    }
  }, [])
  const send = useCallback((action: CatalogAction, undo = false) => {
    if (!current.current || failed.current) return
    const before = current.current
    try {
      current.current = updateCatalog(before, action)
    } catch (failure) {
      return failure instanceof Error
        ? failure.message
        : "Check your product details."
    }
    setCatalog(current.current)
    setPending(n => n + 1)
    const sentSequence = ++sequence.current
    queue.current = queue.current
      .then(async () => {
        if (failed.current) return
        try {
          const snapshot = await request(action, revision.current)
          if (snapshot.revision !== revision.current + 1)
            historyRef.current = []
          historyRef.current = undo
            ? historyRef.current.slice(0, -1)
            : snapshot.previous
              ? [...historyRef.current.slice(-29), snapshot.previous]
              : []
          setHistory(historyRef.current)
          revision.current = snapshot.revision
          if (sentSequence === sequence.current) {
            current.current = snapshot.catalog
            setCatalog(snapshot.catalog)
          }
        } catch (failure) {
          failed.current = true
          try {
            const snapshot = await request()
            current.current = snapshot.catalog
            setCatalog(snapshot.catalog)
          } catch {
            current.current = before
            setCatalog(before)
          }
          setError(
            failure instanceof Error
              ? failure.message
              : "Could not save the catalog. Reload before editing.",
          )
        }
      })
      .finally(() => setPending(n => n - 1))
  }, [])
  const undo = useCallback(() => {
    const previous = historyRef.current.at(-1)
    if (previous) send({ kind: "restore", catalog: previous }, true)
  }, [send])
  return {
    catalog,
    dispatch: send,
    undo,
    canUndo: history.length > 0 && pending === 0 && !error,
    pending,
    error,
  }
}
