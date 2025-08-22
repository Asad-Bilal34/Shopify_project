import { useEffect, useRef, useState, useMemo } from "react";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData, useRevalidator } from "@remix-run/react";
import {
  Page,
  Layout,
  BlockStack,
  InlineStack,
  Button,
  Text,
  Select,
  Box,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

import KpiCard from "../components/KpiCard";
import SectionCard from "../components/SectionCard";
import InventoryTable from "../components/InventoryTable";
import TransfersTable from "../components/TransfersTable";
import SaleModal from "../components/SaleModal";
import TransferModal from "../components/TransferModal";
import QuickActions from "../components/QuickActions";

import { getDashboardData, logTransfer, logSale } from "../shopify.server";
import { prisma } from "../db.server.js";

/* ---------------- LOADER ---------------- */
export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const data = await getDashboardData(admin);

  // normalize snapshot rows to {title, sku, available, virtual}
  const toObj = (r) => {
    if (Array.isArray(r)) {
      const [title, sku, whQty, virtual] = r;
      return {
        title: String(title ?? "Product"),
        sku: String(sku ?? ""),
        available: Number(whQty ?? 0) || 0,
        virtual: Number(virtual ?? 0) || 0,
        productGid: null,
      };
    }
    return {
      title: String(r?.title ?? r?.Product ?? "Product"),
      sku: String(r?.sku ?? r?.SKU ?? r?.variantSku ?? ""),
      available: Number(r?.available ?? r?.warehouseQty ?? r?.qty ?? 0) || 0,
      virtual: Number(r?.virtual ?? r?.virtualTotal ?? 0) || 0,
      productGid: r?.productGid ?? null,
    };
  };

  // add missing SKUs (0-qty) so list looks complete
  const haveSkus = new Set();
  for (const r of data?.inventorySnapshot || []) {
    const sku = Array.isArray(r)
      ? r[1]
      : (r?.sku ?? r?.SKU ?? r?.variantSku ?? null);
    if (sku) haveSkus.add(String(sku));
  }
  const resp = await admin.graphql(`#graphql
    query AllSkus {
      products(first: 250) {
        edges { node { title variants(first: 100) { edges { node { sku } } } } }
      }
    }`);
  const body = await resp.json();
  const extraRows = [];
  for (const pEdge of body?.data?.products?.edges || []) {
    const title = pEdge?.node?.title ?? "Product";
    const vars = pEdge?.node?.variants?.edges || [];
    for (const vEdge of vars) {
      const sku = String(vEdge?.node?.sku || "").trim();
      if (!sku || haveSkus.has(sku)) continue;
      extraRows.push({ title, sku, available: 0, virtual: 0, productGid: null });
    }
  }
  const normalizedSnapshot = [
    ...(data?.inventorySnapshot || []).map(toObj),
    ...extraRows,
  ];

  // dropdown: all virtual locations
  const virtualLocations = await prisma.virtualLocation.findMany({
    orderBy: { name: "asc" },
    select: { name: true },
  });

  return json({
    ...data,
    inventorySnapshot: normalizedSnapshot,
    virtualLocations: virtualLocations.map((v) => v.name),
  });
};

/* ---------------- ACTION ---------------- */
export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "transfer") {
    await logTransfer({
      fromName: String(form.get("from")),
      toName: String(form.get("to")),
      sku: String(form.get("sku")),
      qty: Number(form.get("qty")),
      notes: String(form.get("notes") || ""),
    });
    return json({ ok: true, intent: "transfer" });
  }

  if (intent === "sale") {
    const orderGID = await logSale({
      admin,
      locationName: String(form.get("location")),
      sku: String(form.get("sku")),
      qty: Number(form.get("qty")),
      value: form.get("value") ? Number(form.get("value")) : null,
    });
    return json({ ok: true, intent: "sale", orderGID });
  }

  if (intent === "addLocation") {
    const raw = String(form.get("name") || "").trim();
    if (!raw)
      return json(
        { ok: false, intent, error: "Name required" },
        { status: 400 },
      );
    await prisma.virtualLocation.upsert({
      where: { name: raw },
      update: {},
      create: { name: raw },
    });
    return json({ ok: true, intent: "addLocation" });
  }

  // products present in a selected virtual location (net > 0)
  if (intent === "locationProducts") {
    const locName = String(form.get("locName") || "").trim();
    if (!locName) return json({ ok: true, intent, items: [] });

    const loc = await prisma.virtualLocation.findFirst({
      where: { name: locName },
      select: { id: true },
    });
    if (!loc) return json({ ok: true, intent, items: [] });

    const transfers = await prisma.transfer.findMany({
      where: { OR: [{ toLocationId: loc.id }, { fromLocationId: loc.id }] },
      select: { sku: true, qty: true, toLocationId: true, fromLocationId: true },
      orderBy: { createdAt: "asc" },
      take: 5000,
    });

    const netBySku = new Map();
    for (const t of transfers) {
      const sku = t.sku || "";
      if (!sku) continue;
      const prev = netBySku.get(sku) || 0;
      const delta =
        (t.toLocationId === loc.id ? t.qty || 0 : 0) -
        (t.fromLocationId === loc.id ? t.qty || 0 : 0);
      netBySku.set(sku, prev + delta);
    }

    const items = Array.from(netBySku.entries())
      .filter(([, net]) => (Number(net) || 0) > 0)
      .map(([sku, qty]) => ({ sku, qty: Number(qty) || 0 }));

    return json({ ok: true, intent, items });
  }

  return json({ ok: true, intent: "refresh" });
};

/* ---------------- UI ---------------- */
export default function Index() {
  const {
    stats,
    inventorySnapshot,
    recentTransfers,
    recentSales,
    locations,
    warehouseName,
    virtualLocations,
  } = useLoaderData();

  const fetcher = useFetcher();
  const app = useAppBridge();
  const revalidator = useRevalidator();

  const [transferOpen, setTransferOpen] = useState(false);
  const [saleOpen, setSaleOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const isPosting =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  // toasts once
  const toastLock = useRef(false);
  useEffect(() => {
    if (fetcher.data?.ok && !toastLock.current) {
      toastLock.current = true;
      const i = fetcher.data.intent;
      if (i === "transfer") {
        app.toast.show("Transfer logged", { duration: 2000 });
        revalidator.revalidate();
        setTransferOpen(false);
      } else if (i === "sale") {
        app.toast.show("Sale logged", { duration: 2000 });
        revalidator.revalidate();
        setSaleOpen(false);
      } else if (i === "addLocation") {
        app.toast.show("Location added", { duration: 1600 });
        revalidator.revalidate();
      } else if (i === "refresh") {
        app.toast.show("Dashboard refreshed", { duration: 1600 });
        setRefreshing(false);
      }
      setTimeout(() => { toastLock.current = false; }, 2000);
    }
  }, [fetcher.data, app, revalidator]);

  const handleRefresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    fetcher.submit({ intent: "refresh" }, { method: "POST" });
  };

  // sale modal options: virtual only
  const virtualOnly = useMemo(
    () => (locations || []).filter((l) => l !== warehouseName),
    [locations, warehouseName],
  );

  // product picker list from snapshot (de-duped)
  const productsForPicker = useMemo(() => {
    const map = new Map();
    for (const r of inventorySnapshot || []) {
      const arr = Array.isArray(r) ? r : null;
      const title = arr ? arr[0] : (r?.title ?? "Product");
      const sku = arr
        ? String(arr[1] ?? "")
        : String(r?.sku ?? r?.SKU ?? r?.variantSku ?? "");
      const available =
        Number(arr ? (arr.length >= 3 ? r[2] : r[1]) : (r?.available ?? 0)) || 0;
      const cleanSku = String(sku || "").trim();
      if (!cleanSku) continue;
      if (!map.has(cleanSku)) map.set(cleanSku, { title, sku: cleanSku, available });
    }
    return Array.from(map.values());
  }, [inventorySnapshot]);

  /* ---------- Browse by virtual location ---------- */
  // DEFAULT: All products (warehouse snapshot)
  const [browseLoc, setBrowseLoc] = useState("__ALL__");
  const browseFetcher = useFetcher();

  // unique options, + explicit "All products" option at top
  const vlOptions = useMemo(() => {
    const seen = new Set();
    const cleaned = (virtualLocations || [])
      .map((n) => String(n || "").trim())
      .filter((n) => n.length > 0 && !seen.has(n) && seen.add(n))
      .map((n) => ({ label: n, value: n }));
    return [{ label: "All products (warehouse view)", value: "__ALL__" }, ...cleaned];
  }, [virtualLocations]);

  const onBrowseChange = (val) => {
    setBrowseLoc(val);
    if (val === "__ALL__") return;            // back to default snapshot
    const fd = new FormData();
    fd.set("intent", "locationProducts");
    fd.set("locName", val);
    browseFetcher.submit(fd, { method: "POST" });
  };

  // rows for a selected location — only SKUs present there
  const rowsForSelectedLocation = useMemo(() => {
    if (browseLoc === "__ALL__") return null;
    const items = browseFetcher.data?.items || [];
    if (!items.length) return [];
    const qtyBySku = new Map(items.map((it) => [String(it.sku), Number(it.qty) || 0]));
    const present = new Set(qtyBySku.keys());
    return (inventorySnapshot || [])
      .filter((r) => {
        const isArr = Array.isArray(r);
        const sku = isArr
          ? String(r[1] ?? "")
          : String(r?.sku ?? r?.SKU ?? r?.variantSku ?? "");
        return present.has(sku);
      })
      .map((r) => {
        const isArr = Array.isArray(r);
        const title = isArr ? r[0] : (r?.title ?? "Product");
        const sku = isArr
          ? String(r[1] ?? "")
          : String(r?.sku ?? r?.SKU ?? r?.variantSku ?? "");
        const virtual = isArr ? Number(r[3] ?? r[2] ?? 0) : Number(r?.virtual ?? 0);
        const locQty = qtyBySku.get(sku) || 0;
        return { title, sku, available: locQty, virtual, productGid: r?.productGid ?? null };
      });
  }, [browseLoc, browseFetcher.data, inventorySnapshot]);

  return (
    <Page>
      {/* Header */}
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center" wrap>
          <Text as="h1" variant="headingLg">Virtual Inventory Dashboard</Text>
          <InlineStack gap="200" wrap>
            <Button onClick={handleRefresh} loading={refreshing} disabled={refreshing}>
              Refresh
            </Button>
          </InlineStack>
        </InlineStack>
      </BlockStack>

      {/* Modals */}
      <TransferModal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        locations={locations}
        fetcher={fetcher}
        isSubmitting={isPosting}
        fromOptions={
          warehouseName ? [warehouseName] : locations?.length ? [locations[0]] : []
        }
        toOptions={["AlFateh", "Imtiaz", "Metro", "GreenValley"]}
        products={productsForPicker}
      />
      <SaleModal
        open={saleOpen}
        onClose={() => setSaleOpen(false)}
        locations={virtualOnly}
        fetcher={fetcher}
        isSubmitting={isPosting}
      />

      <BlockStack gap="600">
        <Layout>
          <Layout.Section>
            <InlineStack gap="400" wrap>
              <KpiCard label="Products" value={stats.products} />
              <KpiCard label="Virtual locations" value={stats.virtualLocations} />
              <KpiCard label={warehouseName || "Selected location"} value={stats.inStock} />
              <KpiCard label="Pending transfers" value={stats.pendingTransfers} />
            </InlineStack>
          </Layout.Section>
        </Layout>

        <Layout>
          <Layout.Section>
            <SectionCard title="">
              <Box
                border="divider"
                radius="400"
                background="bg-surface"
                padding="0"
                style={{ borderRadius: 12 }}
              >
                {/* top bar */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 12px",
                    borderBottom: "1px solid var(--p-color-border-subdued)",
                  }}
                >
                  <Text as="h2" variant="headingMd">
                    {browseLoc === "__ALL__" ? warehouseName : browseLoc}
                  </Text>

                  <div style={{ minWidth: 260 }}>
                    <Select
                      label=""
                      options={vlOptions}
                      value={browseLoc}
                      onChange={onBrowseChange}
                    />
                  </div>
                </div>

                {/* body (NO loading UI) */}
                {browseLoc === "__ALL__" ? (
                  // default snapshot
                  <div style={{ padding: 12 }}>
                    <InventoryTable warehouseName={warehouseName} rows={inventorySnapshot} />
                  </div>
                ) : (browseFetcher.data?.items?.length ?? -1) === 0 ? (
                  // selected location but 0 items
                  <div
                    style={{
                      minHeight: 260,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text variant="headingMd" tone="subdued">No products found</Text>
                  </div>
                ) : browseFetcher.data?.items ? (
                  // selected location with items
                  <div style={{ padding: 12 }}>
                    <InventoryTable
                      warehouseName={browseLoc}
                      rows={rowsForSelectedLocation || []}
                    />
                  </div>
                ) : (
                  // request in-flight -> old view (no spinner)
                  <div style={{ padding: 12 }}>
                    <InventoryTable warehouseName={warehouseName} rows={inventorySnapshot} />
                  </div>
                )}
              </Box>
            </SectionCard>
          </Layout.Section>
        </Layout>

        <Layout>
          <Layout.Section>
            <SectionCard title="Recent transfers">
              <TransfersTable rows={recentTransfers} />
            </SectionCard>
          </Layout.Section>

            <Layout.Section variant="oneThird">
              <QuickActions
                recentSales={recentSales}
                onOpenTransfer={() => setTransferOpen(true)}
                onOpenSale={() => setSaleOpen(true)}
              />
            </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
