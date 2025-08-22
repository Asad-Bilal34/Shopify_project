import React from "react";
import {
  Modal, InlineStack, Box, TextField, Button, Popover, OptionList,
  ResourceList, Avatar, BlockStack, Text
} from "@shopify/polaris";

/** Browse/Search picker with sticky footer (count LEFT, buttons RIGHT) */
export default function AddProductsModal({
  open,
  onClose,
  products,
  excludedSkus,
  onAdd,
  forwardedQuery,
}) {
  const [query, setQuery] = React.useState("");
  const [searchBy, setSearchBy] = React.useState("all"); // all|title|sku
  const [searchByOpen, setSearchByOpen] = React.useState(false);
  const [selected, setSelected] = React.useState([]);

  // Scoped CSS: a little taller search input
  const css = `.AddProductsModal .Polaris-TextField__Input{height:44px}`;

  React.useEffect(() => {
    if (typeof forwardedQuery === "string") setQuery(forwardedQuery);
  }, [forwardedQuery]);

  const pool = React.useMemo(
    () => products.filter((p) => !excludedSkus.has(p.sku)),
    [products, excludedSkus]
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter((p) => {
      const n = String(p.name || "").toLowerCase();
      const s = String(p.sku || "").toLowerCase();
      if (searchBy === "title") return n.includes(q);
      if (searchBy === "sku") return s.includes(q);
      return n.includes(q) || s.includes(q);
    });
  }, [pool, query, searchBy]);

  const selectedCount = selected.length;

  const apply = () => {
    if (!selectedCount) return;
    const map = new Map(pool.map((p) => [p.id, p]));
    const toAdd = selected.map((id) => map.get(id)).filter(Boolean);
    onAdd(toAdd);
    setSelected([]);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={() => { setSelected([]); onClose(); }}
      title="Add products"
      large
      limitHeight
    >
      <Modal.Section>
        <style>{css}</style>
        <div className="AddProductsModal">
          {/* Row 1: Search + Search by */}
          <InlineStack align="start" gap="200" wrap>
            <Box width="100%" style={{ maxWidth: 520 }}>
              <TextField
                label=""
                placeholder="Search products"
                value={query}
                onChange={setQuery}
                autoComplete="off"
              />
            </Box>

            <Popover
              active={searchByOpen}
              onClose={() => setSearchByOpen(false)}
              preferredAlignment="left"
              activator={
                <Button disclosure onClick={() => setSearchByOpen((o) => !o)}>
                  {`Search by ${searchBy === "all" ? "All" : searchBy.toUpperCase()}`}
                </Button>
              }
            >
              <OptionList
                options={[
                  { value: "all", label: "All" },
                  { value: "title", label: "Title" },
                  { value: "sku", label: "SKU" },
                ]}
                selected={[searchBy]}
                onChange={(sel) => { setSearchBy(sel?.[0] || "all"); setSearchByOpen(false); }}
              />
            </Popover>
          </InlineStack>

          {/* Row 2: Add filter — under search */}
          <div style={{ marginTop: 8, marginBottom: 8 }}>
            <Button disabled>Add filter +</Button>
          </div>

          {/* Headings (wrapped to avoid DOM unknown-prop warnings) */}
          <Box padding="200">
            <InlineStack align="space-between" blockAlign="center">
              <Text tone="subdued">Products</Text>
              <Text tone="subdued">Available</Text>
            </InlineStack>
          </Box>

          {/* Selectable list */}
          <ResourceList
            resourceName={{ singular: "product", plural: "products" }}
            items={filtered}
            selectable
            selectedItems={selected}
            onSelectionChange={setSelected}
            renderItem={(item) => {
              const { id, name, sku, available } = item;
              return (
                <ResourceList.Item id={id} accessibilityLabel={`Select ${name}`}>
                  <InlineStack align="space-between" blockAlign="center" wrap>
                    <InlineStack gap="300" blockAlign="center">
                      <Avatar customer size="medium" />
                      <BlockStack gap="025">
                        <Text variant="bodyMd">{name}</Text>
                        <Text variant="bodySm" tone="subdued">{sku}</Text>
                      </BlockStack>
                    </InlineStack>
                    <Text variant="bodySm">{Number(available ?? 0)}</Text>
                  </InlineStack>
                </ResourceList.Item>
              );
            }}
          />

          {/* Sticky footer — count LEFT, buttons RIGHT */}
          <div
            style={{
              position: "sticky",
              bottom: 0,
              background: "var(--p-color-bg-surface)",
              padding: "12px 12px",
              borderTop: "1px solid var(--p-color-border-subdued)",
              zIndex: 2,
            }}
          >
            <InlineStack align="space-between" blockAlign="center" wrap>
              <Text tone="subdued">{selectedCount} variants selected</Text>
              <InlineStack gap="200" blockAlign="center">
                <Button onClick={() => { setSelected([]); onClose(); }}>Cancel</Button>
                <Button variant="primary" disabled={!selectedCount} onClick={apply}>
                  Add to transfer
                </Button>
              </InlineStack>
            </InlineStack>
          </div>
        </div>
      </Modal.Section>
    </Modal>
  );
}
