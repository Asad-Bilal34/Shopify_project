import { DataTable, Link } from "@shopify/polaris";

export default function InventoryTable({ rows, warehouseName, onLocationClick }) {
  const whHeading = warehouseName ? `Location — ${warehouseName}` : "Location (Shopify)";

  // Backward-compatible: old array format (["Product","Warehouse","Virtual"])
  const isOldArrayFormat = Array.isArray(rows?.[0]);
  if (isOldArrayFormat) {
    return (
      <DataTable
        columnContentTypes={["text", "numeric", "numeric"]}
        headings={["Product", whHeading, "Virtual locations total"]}
        rows={rows || []}
      />
    );
  }

  // New object format: { title, sku, available, virtual, productGid }
  const tableRows = (rows || []).map((r) => {
    const productId = r?.productGid ? r.productGid.split("/").pop() : null;

    const skuText = r?.sku ? String(r.sku) : "—";
    const skuCell = productId ? (
      <Link url={`shopify:admin/products/${productId}`} target="_blank" removeUnderline>
        {skuText}
      </Link>
    ) : (
      skuText
    );

    const availableVal = String(r?.available ?? 0);
    const availableCell =
      typeof onLocationClick === "function" ? (
        <Link
          url="#"
          removeUnderline
          onClick={(e) => {
            e.preventDefault();
            onLocationClick(r);
          }}
        >
          {availableVal}
        </Link>
      ) : (
        availableVal
      );

    return [
      r?.title ? String(r.title) : "—",
      skuCell,
      availableCell,
      String(r?.virtual ?? 0),
    ];
  });

  return (
    <DataTable
      columnContentTypes={["text", "text", "numeric", "numeric"]}
      headings={["Product", "SKU", whHeading, "Virtual locations total"]}
      rows={tableRows}
    />
  );
}
