import { DataTable } from "@shopify/polaris";

export default function TransfersTable({ rows }) {
  return (
    <DataTable
      columnContentTypes={["text", "text", "text", "numeric", "text"]}
      headings={["Date", "Movement", "SKU", "Qty", "Notes"]}
      rows={rows}
    />
  );
}
