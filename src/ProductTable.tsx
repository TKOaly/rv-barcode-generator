import { useMemo } from "react";
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { getCategory, type Product } from "./catalog";

type Props = {
  products: Product[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onEdit: (product: Product) => void;
  onDelete: (id: string) => void;
  onInclude: (id: string, included: boolean) => void;
};
const helper = createColumnHelper<Product>();
export function ProductTable({ products, selectedId, onSelect, onEdit, onDelete, onInclude }: Props) {
  const columns = useMemo(() => [
    helper.display({ id: "category", cell: info => getCategory(info.row.original.ean)?.label ?? "Unassigned" }),
    helper.accessor("name", {
      cell: info => <div className="product-info">
        <div className="thumbnail"><img src={info.row.original.image} alt="" /></div>
        <div><button className="product-name" onClick={() => onEdit(info.row.original)}>{info.getValue()}</button><span className="row-ean">{info.row.original.ean}</span></div>
      </div>,
    }),
    helper.display({
      id: "actions",
      cell: info => <div className="row-actions" onClick={event => event.stopPropagation()}>
        <label className="include-toggle"><input type="checkbox" aria-label={`Include ${info.row.original.name}`} checked={info.row.original.included} onChange={event => onInclude(info.row.original.id, event.target.checked)} />Include</label>
        <button aria-label={`Edit ${info.row.original.name}`} onClick={() => onEdit(info.row.original)}>Edit</button>
        <button aria-label={`Delete ${info.row.original.name}`} onClick={() => onDelete(info.row.original.id)}>Delete</button>
      </div>,
    }),
  ], [onEdit, onDelete, onInclude]);
  const table = useReactTable({ data: products, columns, getCoreRowModel: getCoreRowModel() });
  return <table className="product-table"><tbody>{table.getRowModel().rows.map(row => (
    <tr key={row.id} className={selectedId === row.original.id ? "selected-row" : ""} onClick={() => onSelect(row.original.id)} data-testid="product-row">
      {row.getVisibleCells().map(cell => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}
    </tr>
  ))}</tbody></table>;
}
