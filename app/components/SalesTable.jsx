import { DataTable } from "@shopify/polaris";

export default function SalesTable({ rows }) {
  return (
    <DataTable
      columnContentTypes={["text", "text", "numeric", "text"]}
      headings={["Date", "Location", "Items", "Value"]}
      rows={rows || []}
    />
  );
}
