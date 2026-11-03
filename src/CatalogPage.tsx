import { useLayoutEffect, useRef } from "react"
import JsBarcode from "jsbarcode"
import { useDraggable, useDroppable } from "@dnd-kit/core"
import type { Product } from "./catalog"

export function Barcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null)
  useLayoutEffect(() => {
    if (ref.current)
      JsBarcode(ref.current, value, {
        format: "EAN8",
        width: 2,
        height: 49,
        fontSize: 17,
        textMargin: 3,
        margin: 8,
        background: "#ffffff",
        lineColor: "#111111",
      })
  }, [value])
  return <svg ref={ref} role="img" aria-label={`EAN-8 ${value}`} />
}
function ProductCard({
  product,
  selected,
  onSelect,
  draggable,
}: {
  product: Product
  selected: boolean
  onSelect?: (id: string) => void
  draggable: boolean
}) {
  const drag = useDraggable({ id: product.id, disabled: !draggable })
  const drop = useDroppable({ id: product.id, disabled: !draggable })
  return (
    <div
      ref={element => {
        drag.setNodeRef(element)
        drop.setNodeRef(element)
      }}
      className={`product-card ${selected ? "selected" : ""} ${draggable ? "draggable-card" : ""} ${drop.isOver && !drag.isDragging ? "drop-target" : ""}`}
      style={{ opacity: drag.isDragging ? 0.35 : 1 }}
      onClick={() => onSelect?.(product.id)}
      {...(draggable ? drag.attributes : {})}
      {...(draggable ? drag.listeners : {})}
      aria-label={draggable ? `Move ${product.name} in preview` : undefined}
    >
      <img
        src={product.image}
        alt=""
        draggable={false}
        onLoad={event => {
          event.currentTarget.style.visibility = "visible"
        }}
        onError={event => {
          event.currentTarget.style.visibility = "hidden"
        }}
      />
      <div className="card-details">
        <div
          className={`card-name ${product.name.length > 70 ? "long-name" : ""}`}
        >
          {product.name}
        </div>
        <Barcode value={product.ean} />
      </div>
    </div>
  )
}
export function CatalogPage({
  products,
  selectedId,
  onSelect,
  draggable = false,
}: {
  products: Array<Product>
  selectedId?: string | null
  onSelect?: (id: string) => void
  draggable?: boolean
}) {
  return (
    <div className="catalog-paper" aria-label="Catalog page">
      <div className="card-grid">
        {products.map(product => (
          <ProductCard
            key={product.id}
            product={product}
            selected={selectedId === product.id}
            onSelect={onSelect}
            draggable={draggable}
          />
        ))}
      </div>
    </div>
  )
}
