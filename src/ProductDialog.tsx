import { useEffect, useRef, useState } from "react";
import { actionSchema, categories, categoryKeySchema, getCategory, imageSchema, nextCategoryEan, type CatalogAction, type CategoryKey, type Product } from "./catalog";

export function ProductDialog({
  product,
  onSave,
  onClose,
  products,
}: {
  product: Product | null;
  products: Product[];
  onSave: (action: CatalogAction) => string | undefined;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  const [category, setCategory] = useState<CategoryKey>(categories[0].key);
  const candidate = nextCategoryEan(products, category);
  const full = !product && !candidate;
  const [image, setImage] = useState(product?.image ?? "");
  const [preview, setPreview] = useState("");
  const [uploading, setUploading] = useState(false);
  const upload = useRef<AbortController | null>(null);
  const previewUrl = useRef("");
  async function selectPhoto(file: File | undefined) {
    upload.current?.abort();
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = "";
    setPreview("");
    setImage(product?.image ?? "");
    setError("");
    setUploading(false);
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError("Photo must be at most 10 MiB."); return; }
    const controller = new AbortController();
    upload.current = controller;
    previewUrl.current = URL.createObjectURL(file);
    setPreview(previewUrl.current);
    setUploading(true);
    try {
      const response = await fetch('/api/images', { method: 'POST', body: file, signal: controller.signal });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error(result && typeof result === 'object' && 'error' in result && typeof result.error === 'string' ? result.error : 'Could not upload photo.');
      const ref = imageSchema.parse(result && typeof result === 'object' && 'image' in result ? result.image : undefined);
      if (upload.current === controller && !controller.signal.aborted) setImage(ref);
    } catch (failure) {
      if (upload.current === controller && !controller.signal.aborted) {
        setError(failure instanceof Error ? failure.message : 'Could not upload photo.');
        setPreview("");
      }
    } finally {
      if (upload.current === controller && !controller.signal.aborted) setUploading(false);
    }
  }
  useEffect(() => () => {
    upload.current?.abort();
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
  }, []);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (uploading || !image) { setError("Upload a product photo."); return; }
          const data = new FormData(event.currentTarget);
          const details = {
            id: product?.id ?? crypto.randomUUID(),
            name: data.get("name"),
            image,
            included: data.get("included") === "on",
          };
          if (full) { setError("This category is full. Choose another category."); return; }
          const result = actionSchema.safeParse(product
            ? { kind: "save", product: { ...details, ean: product.ean } }
            : { kind: "create", product: details, category });
          if (!result.success) {
            setError(
              result.error.issues[0]?.message ?? "Check your product details.",
            );
            return;
          }
          const failure = onSave(result.data);
          if (failure) setError(failure);
        }}
      >
        <label>
          Product name
          <input
            autoFocus
            name="name"
            required
            maxLength={140}
            defaultValue={product?.name}
            placeholder="e.g. KitKat MINI 16,7g"
          />
        </label>
        <label>
          Category
          {product ? <input aria-label="Category" readOnly value={getCategory(product.ean)?.label ?? "Unassigned"} /> :
            <select aria-label="Category" value={category} onChange={event => { setCategory(categoryKeySchema.parse(event.target.value)); setError(""); }}>
              {categories.map(category => <option key={category.key} value={category.key}>{category.label}</option>)}
            </select>}
        </label>
        <label>
          EAN-8 barcode
          <input readOnly value={product?.ean ?? candidate ?? ""} />
        </label>

        <label className="include-toggle"><input type="checkbox" name="included" defaultChecked={product?.included ?? true} />Include in catalog</label>
        <label>
          Product photo
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { void selectPhoto(event.target.files?.[0]); }} />
        </label>
        {(preview || image) && <img className="photo-preview" src={preview || image} alt="Selected product photo" />}
        {(error || full) && (
          <p className="form-error" role="alert">
            {error || "This category is full. Choose another category."}
          </p>
        )}
        <div className="dialog-footer">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" type="submit" disabled={full || uploading || !image}>
            {product ? "Save changes" : "Add product"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
