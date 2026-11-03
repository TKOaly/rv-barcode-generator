import { useCallback, useEffect, useRef, useState } from "react"
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import { CatalogPage } from "./CatalogPage"
import { ProductDialog } from "./ProductDialog"
import { ProductTable } from "./ProductTable"
import { categories, getCategory, paginate } from "./catalog"
import { useCatalog } from "./useCatalog"
import type { Product } from "./catalog"

function PaperPreview({
  products,
  selectedId,
  onSelect,
}: {
  products: Array<Product>
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(650)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const scale = Math.max(0.1, (width - 48) / 1122.52)
  return (
    <div className="paper-viewport" ref={ref}>
      <div
        className="paper-center"
        style={{ width: 1122.52 * scale, height: 793.7 * scale }}
      >
        <div
          style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}
        >
          <CatalogPage
            products={products}
            selectedId={selectedId}
            onSelect={onSelect}
            draggable
          />
        </div>
      </div>
    </div>
  )
}
export function Studio() {
  const { catalog, dispatch, pending, error } = useCatalog()
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<
    { kind: "closed" } | { kind: "product"; product: Product | null }
  >({ kind: "closed" })
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  )
  const pages = paginate(catalog?.products ?? [])
  const filtered = (catalog?.products ?? []).filter(
    p =>
      (!category || getCategory(p.ean)?.key === category) &&
      `${p.name} ${p.ean}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  )
  function select(id: string) {
    setSelectedId(id)
  }
  const move = useCallback(
    (id: string, targetId: string) => dispatch({ kind: "move", id, targetId }),
    [dispatch],
  )
  const edit = useCallback(
    (product: Product) => setDialog({ kind: "product", product }),
    [],
  )
  const remove = useCallback(
    (id: string) => {
      dispatch({ kind: "remove", id })
    },
    [dispatch],
  )
  function openPrint() {
    window.print()
  }
  if (!catalog)
    return (
      <p role={error ? "alert" : undefined}>{error || "Loading catalog…"}</p>
    )
  return (
    <>
      {error && <p role="alert">{error}</p>}
      <main className="split-layout">
        <section
          className="management"
          aria-label="Manage products"
          style={error ? { pointerEvents: "none", opacity: 0.6 } : undefined}
        >
          <div className="management-tools">
            <div className="filters">
              <div className="search-control">
                <input
                  aria-label="Search products"
                  placeholder="Search products or barcodes"
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                />
                {query && (
                  <button
                    aria-label="Clear search"
                    onClick={() => setQuery("")}
                  >
                    Clear
                  </button>
                )}
              </div>
              <select
                aria-label="Filter category"
                value={category}
                onChange={event => setCategory(event.target.value)}
              >
                <option value="">All categories</option>
                {categories.map(category => (
                  <option key={category.key} value={category.key}>
                    {category.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="controls">
              <button
                disabled={catalog.products.length >= 500}
                onClick={() => setDialog({ kind: "product", product: null })}
              >
                Add product
              </button>
              <button
                disabled={pending > 0 || Boolean(error)}
                onClick={openPrint}
              >
                Print catalog
              </button>
            </div>
          </div>
          <div className="table-scroll">
            <ProductTable
              products={filtered}
              selectedId={selectedId}
              onSelect={select}
              onEdit={edit}
              onDelete={remove}
              onInclude={(id, included) =>
                dispatch({ kind: "set-included", id, included })
              }
            />
            {filtered.length === 0 && (
              <p className="empty-state">No products</p>
            )}
          </div>
        </section>
        <section className="preview-panel" aria-label="Live preview">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={({ active }) => setDraggedId(String(active.id))}
            onDragCancel={() => setDraggedId(null)}
            onDragEnd={({ active, over }) => {
              if (over && active.id !== over.id)
                move(String(active.id), String(over.id))
              setDraggedId(null)
            }}
          >
            <div className="preview-canvas">
              {pages.map((products, index) => (
                <PaperPreview
                  key={index}
                  products={products}
                  selectedId={selectedId}
                  onSelect={select}
                />
              ))}
            </div>
            <DragOverlay>
              {draggedId && (
                <div className="drag-preview">
                  {
                    catalog.products.find(product => product.id === draggedId)
                      ?.name
                  }
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </section>
        {dialog.kind === "product" && (
          <ProductDialog
            products={catalog.products}
            product={dialog.product}
            onClose={() => setDialog({ kind: "closed" })}
            onSave={action => {
              const failure = dispatch(action)
              if (failure) return failure
              setDialog({ kind: "closed" })
            }}
          />
        )}
      </main>
      <div className="studio-print-pages">
        {pages.map((products, index) => (
          <CatalogPage key={index} products={products} />
        ))}
      </div>
    </>
  )
}

export function PrintView() {
  const { catalog, error } = useCatalog()
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let active = true
    setReady(false)
    const images = Array.from(document.images)
    Promise.all([
      document.fonts.ready,
      ...images.map(image => image.decode().catch(() => undefined)),
    ]).then(() => {
      if (active) setReady(true)
    })
    return () => {
      active = false
    }
  }, [catalog])
  if (!catalog)
    return (
      <p role={error ? "alert" : undefined}>{error || "Loading catalog…"}</p>
    )
  return (
    <main className="print-view">
      <div className="print-controls">
        <a href="/">Back</a>
        <button disabled={!ready} onClick={() => window.print()}>
          Print / Save as PDF
        </button>
      </div>
      <div className="print-pages">
        {paginate(catalog.products).map((products, index) => (
          <CatalogPage key={index} products={products} />
        ))}
      </div>
    </main>
  )
}
