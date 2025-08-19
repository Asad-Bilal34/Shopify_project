import { useState, useMemo } from "react";
import {
  Card,
  InlineStack,
  TextField,
  Button,
  Modal,
  DataTable,
  Text,
  BlockStack,
} from "@shopify/polaris";

/** props: products:[{title,sku,available}], onSelect(p) */
export default function ProductPicker({ products = [], onSelect }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return products;
    return products.filter(
      (p) =>
        (p.title || "").toLowerCase().includes(t) ||
        String(p.sku || "").toLowerCase().includes(t)
    );
  }, [q, products]);

  const rows = (filtered || []).map((p) => [
    p.title || "—",
    p.sku || "—",
    String(p.available ?? 0),
    <Button
      size="slim"
      onClick={() => {
        onSelect?.(p);
        setOpen(false);
      }}
    >
      Select
    </Button>,
  ]);

  return (
    <Card>
      <BlockStack gap="200">
        <Text as="h3" variant="headingMd">Add products</Text>
        <InlineStack gap="200" wrap>
          <TextField
            value={q}
            onChange={setQ}
            placeholder="Search products"
            autoComplete="off"
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => e.key === "Enter" && setOpen(true)}
          />
          <Button onClick={() => setOpen(true)}>Search</Button>
          <Button onClick={() => { setQ(""); setOpen(true); }}>Browse</Button>
          <Button disabled>Import</Button>
        </InlineStack>
      </BlockStack>

      <Modal open={open} onClose={() => setOpen(false)} title="Add products">
        <Modal.Section>
          {rows.length === 0 ? (
            <BlockStack gap="200" align="center">
              <Text alignment="center" as="p" variant="bodyMd">No products found</Text>
              <Text alignment="center" as="p" tone="subdued" variant="bodySm">
                Try changing the search term
              </Text>
            </BlockStack>
          ) : (
            <DataTable
              columnContentTypes={["text", "text", "numeric", "text"]}
              headings={["Products", "SKU", "Available", ""]}
              rows={rows}
            />
          )}
        </Modal.Section>
      </Modal>
    </Card>
  );
}
