// app/routes/app.transfers.jsx
import React from "react";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData, useRevalidator } from "@remix-run/react";
import {
  Page,
  Layout,
  Box,
  BlockStack,
  InlineStack,
  Text,
  TextField,
  Button,
  Modal,
  Banner,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getDashboardData, logTransfer } from "../shopify.server";
import TransfersTable from "../components/TransfersTable";

// split components
import SelectField from "../components/SelectField";
import AddProductsModal from "../components/AddProductsModal";
import LinesList from "../components/LinesList";

/* ----------------- LOADER ----------------- */
export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const data = await getDashboardData(admin);

  const toObj = (r) => {
    if (Array.isArray(r)) {
      const [title, sku, whQty, virtual] = r;
      return { title: String(title ?? "Product"), sku: String(sku ?? ""), available: Number(whQty ?? 0) || 0, virtual: Number(virtual ?? 0) || 0, productGid: null };
    }
    return {
      title: String(r?.title ?? r?.Product ?? "Product"),
      sku: String(r?.sku ?? r?.SKU ?? r?.variantSku ?? ""),
      available: Number(r?.available ?? r?.warehouseQty ?? r?.qty ?? 0) || 0,
      virtual: Number(r?.virtual ?? r?.virtualTotal ?? 0) || 0,
      productGid: r?.productGid ?? null,
    };
  };

  const snap = (data?.inventorySnapshot || []).map(toObj);
  const products = snap
    .filter((p) => (p.sku || "").trim().length > 0)
    .map((p) => ({ id: p.sku, name: p.title || "Product", sku: p.sku, available: Number(p.available || 0), productGid: p.productGid || null }));

  return json({
    warehouseName: data.warehouseName || "Warehouse",
    locations: data.locations || [],
    products,
    recentTransfers: data.recentTransfers || [],
  });
};

/* ----------------- ACTION ----------------- */
export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "batchTransfer") {
    const destination = String(form.get("destination") || "").trim();
    const origin = String(form.get("origin") || "").trim();
    const notes = String(form.get("notes") || "");
    const dateCreated = String(form.get("dateCreated") || "");
    const referenceName = String(form.get("referenceName") || "");
    const tags = String(form.get("tags") || "");
    let lines = [];
    try {
      lines = JSON.parse(String(form.get("lines") || "[]"));
    } catch {
      return json({ ok: false, error: "Invalid lines payload" }, { status: 400 });
    }
    if (!destination) return json({ ok: false, error: "Destination required" }, { status: 400 });

    let count = 0;
    for (const l of lines) {
      const sku = String(l?.sku || "").trim();
      const qty = Number(l?.qty || 0);
      if (!sku || qty <= 0) continue;
      await logTransfer({ fromName: origin, toName: destination, sku, qty, notes });
      count++;
    }
    return json({ ok: true, intent, count, destination, dateCreated, referenceName, tags });
  }

  return json({ ok: true });
};

/* ----------------- MAIN ----------------- */
export default function TransfersLayout() {
  const { warehouseName, locations, products, recentTransfers } = useLoaderData();
  const fetcher = useFetcher();
  const app = useAppBridge();
  const revalidator = useRevalidator();

  const origin = warehouseName;
  const originOptions = [{ label: origin, value: origin }];
  const destOptions = Array.from(new Set(["AlFateh", "Imtiaz", "Metro", "GreenValley", ...locations]))
    .filter((x) => x && x !== origin)
    .map((x) => ({ label: x, value: x }));

  const [destination, setDestination] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [dateCreated, setDateCreated] = React.useState(new Date().toISOString().slice(0, 10));
  const [referenceName, setReferenceName] = React.useState("");
  const [tags, setTags] = React.useState("");

  const [lines, setLines] = React.useState([]); // { sku, name, available, qty }

  const [browseOpen, setBrowseOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [importErr, setImportErr] = React.useState("");

  const [searchQ, setSearchQ] = React.useState("");
  const handleTopSearch = (v) => { setSearchQ(v); if (!browseOpen) setBrowseOpen(true); };

  const inSelected = new Set(lines.map((l) => l.sku));
  const overdrawn = lines.filter((l) => l.qty > l.available);
  const hasInvalid = !destination || lines.length === 0 || lines.every((l) => l.qty <= 0) || overdrawn.length > 0;

  const submitting = ["loading", "submitting"].includes(fetcher.state) && fetcher.formMethod === "POST";

  React.useEffect(() => {
    if (fetcher.data?.ok) {
      app.toast.show(`Transfer created (${fetcher.data.count || 0} lines)`, { duration: 2000 });
      setLines([]); setSearchQ(""); setNotes(""); setReferenceName(""); setTags("");
      revalidator.revalidate();
    }
  }, [fetcher.data, app, revalidator]);

  const handleCsvFile = async (file) => {
    setImportErr("");
    try {
      const text = await file.text();
      const rows = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const out = [];
      for (const row of rows) {
        const parts = row.split(",").map((s) => s.trim());
        if (parts.length < 2) continue;
        if (parts[0].toLowerCase() === "sku") continue;
        const sku = parts[0];
        const qty = Number(parts[1] || 0) || 0;
        const p = products.find((pp) => pp.sku === sku);
        if (!p) continue;
        out.push({ sku, name: p.name, available: p.available, qty });
      }
      setLines((prev) => {
        const map = new Map(prev.map((l) => [l.sku, { ...l }]));
        for (const l of out) {
          if (map.has(l.sku)) {
            const cur = map.get(l.sku);
            map.set(l.sku, { ...cur, qty: Number(cur.qty || 0) + Number(l.qty || 0) });
          } else {
            map.set(l.sku, l);
          }
        }
        return Array.from(map.values());
      });
      setImportOpen(false);
    } catch {
      setImportErr("CSV parse error. Expected format: sku,qty");
    }
  };

  const submit = () => {
    const payload = lines.filter((l) => l.qty > 0).map((l) => ({ sku: l.sku, qty: l.qty }));
    fetcher.submit(
      { intent: "batchTransfer", origin, destination, notes, dateCreated, referenceName, tags, lines: JSON.stringify(payload) },
      { method: "POST" }
    );
  };

  // compact heights for the three top cards
  const CARD_MIN_HEIGHT = 92;

  return (
    <Page title="Create transfer">
      {/* unified card style */}
      <style>{`
        .soft-card{
          background: var(--p-color-bg-surface);
          border: 1px solid var(--p-color-border-subdued);
          border-radius: 12px;
          padding: 10px;
          min-height: ${CARD_MIN_HEIGHT}px;
          overflow: hidden;
        }
        .soft-card h2{ margin: 0 0 6px; }
        @media (min-width: 600px) {
          .soft-card .Polaris-Text--subdued{ display:none; }
        }
      `}</style>

      <Layout>
        {/* Row 1: Origin + Destination + Notes (headings inside, same slim height) */}
        <Layout.Section>
          <InlineStack gap="200" wrap={false}>
            <div className="soft-card" style={{ flex: "0 0 32.5%", minWidth: 270 }}>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Origin</Text>
                <SelectField
                  label="" // heading shown above
                  value={origin}
                  onChange={() => {}}
                  options={originOptions}
                  // helpText="Origin is your selected location."
                />
              </BlockStack>
            </div>

            <div className="soft-card" style={{ flex: "0 0 32.5%", minWidth: 270 }}>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Destination</Text>
                <SelectField
                  label=""
                  value={destination}
                  onChange={setDestination}
                  options={destOptions}
                  placeholder="Select destination"
                />
              </BlockStack>
            </div>

            <div className="soft-card" style={{ flex: "1 1 0%" }}>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Notes</Text>
                <TextField
                  label=""
                  value={notes}
                  onChange={setNotes}
                  placeholder="No notes"
                  multiline={3}
                  autoComplete="off"
                />
              </BlockStack>
            </div>
          </InlineStack>
        </Layout.Section>

        {/* Row 2: Add products (now also a soft-card) */}
        <Layout.Section>
          <div className="soft-card">
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Add products</Text>

              <InlineStack gap="200" wrap={false} align="start">
                <Box width="auto" style={{ flex: "0 1 460px", minWidth: 320, maxWidth: 460 }}>
                  <TextField
                    label=""
                    placeholder="Search products"
                    value={searchQ}
                    onChange={handleTopSearch}
                    onFocus={() => setBrowseOpen(true)}
                    autoComplete="off"
                  />
                </Box>
                <Button onClick={() => setBrowseOpen(true)}>Browse</Button>
                <Button onClick={() => setImportOpen(true)}>Import</Button>
                <Button disabled>⋯</Button>
              </InlineStack>

              {overdrawn.length > 0 && (
                <Banner tone="critical" title="Not enough stock at origin">
                  <p>Some lines exceed available quantity. Please adjust quantities.</p>
                </Banner>
              )}

              {lines.length > 0 && (
                <LinesList
                  lines={lines}
                  onQtyChange={(sku, v) =>
                    setLines((prev) =>
                      prev.map((x) => (x.sku === sku ? { ...x, qty: Math.max(0, Number(v || 0) || 0) } : x))
                    )
                  }
                  onRemove={(sku) => setLines((prev) => prev.filter((x) => x.sku !== sku))}
                />
              )}

              <InlineStack align="end">
                <Button variant="primary" onClick={submit} loading={submitting} disabled={hasInvalid || submitting}>
                  Create transfer
                </Button>
              </InlineStack>
            </BlockStack>
          </div>

          <div style={{ height: "var(--p-space-400)" }} />

          <div className="soft-card">
            <Text as="h2" variant="headingMd">Recent transfers</Text>
            <div style={{ height: "var(--p-space-200)" }} />
            <TransfersTable rows={recentTransfers} />
          </div>
        </Layout.Section>

        {/* Right column: Transfer details + Tags (also soft-card) */}
        <Layout.Section variant="oneThird">
          <div className="soft-card">
            <Text as="h2" variant="headingMd">Transfer details</Text>
            <BlockStack gap="300">
              <TextField label="Date created" type="date" value={dateCreated} onChange={setDateCreated} autoComplete="off" />
              <TextField label="Reference name" value={referenceName} onChange={setReferenceName} autoComplete="off" />
            </BlockStack>
          </div>

          <div style={{ height: "var(--p-space-400)" }} />

          <div className="soft-card">
            <Text as="h2" variant="headingMd">Tags</Text>
            <Box>
              <TextField label="" value={tags} onChange={setTags} maxLength={40} autoComplete="off" placeholder="0/40" />
            </Box>
          </div>
        </Layout.Section>
      </Layout>

      {/* Browse modal */}
      <AddProductsModal
        open={browseOpen}
        onClose={() => setBrowseOpen(false)}
        products={products}
        excludedSkus={inSelected}
        forwardedQuery={searchQ}
        onAdd={(picked) => {
          setLines((prev) => {
            const existing = new Set(prev.map((l) => l.sku));
            const merged = [...prev];
            for (const it of picked) {
              if (!existing.has(it.sku)) merged.push({ sku: it.sku, name: it.name, available: it.available, qty: 1 });
            }
            return merged;
          });
        }}
      />

      {/* Import CSV */}
      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import CSV (sku,qty)"
        primaryAction={{ content: "Close", onAction: () => setImportOpen(false) }}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); }}
            />
            {importErr ? <Banner tone="critical" title={importErr} /> : null}
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
