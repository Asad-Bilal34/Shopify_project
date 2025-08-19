import { useEffect, useRef, useState } from "react";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData, useRevalidator } from "@remix-run/react";
import {
  Page,
  Layout,
  BlockStack,
  InlineStack,
  Button,
  Text,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

import KpiCard from "../components/KpiCard";
import SectionCard from "../components/SectionCard";
import InventoryTable from "../components/InventoryTable";
import TransfersTable from "../components/TransfersTable";
import SalesTable from "../components/SalesTable";
import TransferModal from "../components/TransferModal";
import SaleModal from "../components/SaleModal";
import QuickActions from "../components/QuickActions";

import { getDashboardData, logTransfer, logSale } from "../shopify.server";
import { prisma } from "../db.server.js"; // for addLocation intent

// ---------- LOADER ----------
export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const data = await getDashboardData(admin); // tumhara existing data

  // helper: row ko object shape me normalize karo
  const toObj = (r) => {
    if (Array.isArray(r)) {
      // [Product, SKU, WarehouseQty, VirtualTotal]
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

  // snapshot me jo SKUs already hain
  const haveSkus = new Set();
  for (const r of data?.inventorySnapshot || []) {
    const sku = Array.isArray(r) ? r[1] : (r?.sku ?? r?.SKU ?? r?.variantSku ?? null);
    if (sku) haveSkus.add(String(sku));
  }

  // Shopify se saare products + variants (SKUs)
  const resp = await admin.graphql(`#graphql
    query AllSkus {
      products(first: 250) {
        edges {
          node {
            title
            variants(first: 100) {
              edges { node { sku } }
            }
          }
        }
      }
    }
  `);
  const body = await resp.json();

  // jo SKUs missing hain unke liye 0-qty rows add — **object** shape me
  const extraRows = [];
  for (const pEdge of body?.data?.products?.edges || []) {
    const title = pEdge?.node?.title ?? "Product";
    const vars = pEdge?.node?.variants?.edges || [];
    for (const vEdge of vars) {
      const sku = String(vEdge?.node?.sku || "").trim();
      if (!sku) continue;               // empty SKU skip
      if (haveSkus.has(sku)) continue;  // already present
      extraRows.push({ title, sku, available: 0, virtual: 0, productGid: null });
    }
  }

  // purani rows + extra rows sab ko object me normalize karke bhejo
  const normalizedSnapshot = [
    ...(data?.inventorySnapshot || []).map(toObj),
    ...extraRows,
  ];

  return json({
    ...data,
    inventorySnapshot: normalizedSnapshot,
  });
};

// ---------- ACTION ----------
export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "transfer") {
    const from = form.get("from");
    const to = form.get("to");
    const sku = form.get("sku");
    const qty = form.get("qty");
    const notes = form.get("notes");

    await logTransfer({
      fromName: String(from),
      toName: String(to),
      sku: String(sku),
      qty: Number(qty),
      notes: String(notes || ""),
    });
    return json({ ok: true, intent: "transfer" });
  }

  if (intent === "sale") {
    const location = form.get("location");
    const sku = form.get("sku");
    const qty = form.get("qty");
    const value = form.get("value");

    const orderGID = await logSale({
      admin,
      locationName: String(location),
      sku: String(sku),
      qty: Number(qty),
      value: value ? Number(value) : null,
    });
    return json({ ok: true, intent: "sale", orderGID });
  }

  // ✅ Add a virtual location (existing flow)
  if (intent === "addLocation") {
    const raw = String(form.get("name") || "").trim();
    if (!raw) return json({ ok: false, intent, error: "Name required" }, { status: 400 });

    await prisma.virtualLocation.upsert({
      where: { name: raw },
      update: {},
      create: { name: raw },
    });
    return json({ ok: true, intent: "addLocation" });
  }

  // default refresh (manual)
  return json({ ok: true, intent: "refresh" });
};

export default function Index() {
  const {
    stats,
    inventorySnapshot,
    recentTransfers,
    recentSales,
    locations,
    warehouseName,
  } = useLoaderData();

  const fetcher = useFetcher();
  const app = useAppBridge();
  const revalidator = useRevalidator();

  const [transferOpen, setTransferOpen] = useState(false);
  const [saleOpen, setSaleOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false); // manual refresh state

  const isPosting =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  // Toasts + selective revalidate
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

  // Exclude Shopify location from Sale modal options
  const virtualOnly = locations.filter((l) => l !== warehouseName);

  // --- products list for TransferModal picker (unique by SKU) — logic same
  const productsForPicker = (() => {
    const map = new Map();
    for (const r of inventorySnapshot || []) {
      const arr = Array.isArray(r) ? r : null;
      const title = arr ? arr[0] : (r?.title ?? "Product");
      const sku =
        arr ? String(arr[1] ?? "") :
        String(r?.sku ?? r?.SKU ?? r?.variantSku ?? "");
      const available = Number(
        arr ? (arr.length >= 3 ? arr[2] : arr[1]) : (r?.available ?? 0)
      ) || 0;

      const cleanSku = String(sku || "").trim();
      if (!cleanSku) continue;
      if (!map.has(cleanSku)) map.set(cleanSku, { title, sku: cleanSku, available });
    }
    return Array.from(map.values());
  })();

  // ✅ Heading me sirf warehouseName (location) dikhana hai
  const invTitle = warehouseName || "Inventory snapshot";

  return (
    <Page>
      {/* Header */}
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center" wrap>
          <Text as="h1" variant="headingLg">
            Virtual Inventory Dashboard
          </Text>

          {/* RIGHT controls: Refresh + nav */}
          <InlineStack gap="200" wrap>
            <Button onClick={handleRefresh} loading={refreshing} disabled={refreshing}>
              Refresh
            </Button>
            <Button url="/app/transfers">Transfers</Button>
            <Button url="/app/sales">Sales</Button>
            <Button url="/app/reports">Reports</Button>
            <Button url="/app/settings">Settings</Button>
            <Button url="/app/locations">Locations</Button>
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
        fromOptions={warehouseName ? [warehouseName] : (locations?.length ? [locations[0]] : [])}
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
            <SectionCard title={invTitle}>
              <InventoryTable
                rows={inventorySnapshot}
                warehouseName={warehouseName}
              />
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
