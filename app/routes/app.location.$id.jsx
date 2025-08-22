import React from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import {
  Page, Layout, Box, BlockStack, InlineStack, Text,
  DataTable, Button, TextField, Banner
} from "@shopify/polaris";
import { authenticate } from "../shopify.server.js";
import TransfersTable from "../components/TransfersTable.jsx";
import { prisma } from "../db.server.js";

/* ----------------- LOADER ----------------- */
export const loader = async ({ request, params }) => {
  await authenticate.admin(request);

  const identRaw = decodeURIComponent(params.id || "").trim();
  const isNumericId = /^\d+$/.test(identRaw);

  const url = new URL(request.url);
  const startStr = url.searchParams.get("start") || "";
  const endStr = url.searchParams.get("end") || "";

  const toDate = (s) => {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  };
  const startDate = startStr ? toDate(startStr) : null;
  const endDate = endStr ? toDate(endStr) : null;
  const endInc = endDate
    ? new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() + 1)
    : null;

  const createdAt =
    startDate || endInc
      ? {
          ...(startDate ? { gte: startDate } : {}),
          ...(endInc ? { lt: endInc } : {}),
        }
      : undefined;

  let locationName = identRaw;
  let where;

  if (isNumericId) {
    const locId = Number(identRaw);
    const loc = await prisma.virtualLocation.findUnique({
      where: { id: locId },
      select: { name: true },
    });
    if (loc?.name) locationName = loc.name;

    where = {
      OR: [{ toLocationId: locId }, { fromLocationId: locId }],
      ...(createdAt ? { createdAt } : {}),
    };
  } else {
    where = {
      OR: [
        { toLocation: { name: locationName } },
        { fromLocation: { name: locationName } },
      ],
      ...(createdAt ? { createdAt } : {}),
    };
  }

  const transfers = await prisma.transfer.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      fromLocation: { select: { name: true } },
      toLocation: { select: { name: true } },
    },
  });

  const recent = transfers.slice(0, 100).map((t) => ({
    createdAt: t.createdAt,
    fromName: t.fromLocation?.name || "",
    toName: t.toLocation?.name || "",
    sku: t.sku || "",
    qty: Number(t.qty || 0) || 0,
    notes: t.notes || "",
  }));

  const agg = new Map();
  let totalIn = 0, totalOut = 0;
  for (const t of transfers) {
    const sku = t.sku || "(no-sku)";
    if (!agg.has(sku)) agg.set(sku, { title: "", in: 0, out: 0 });
    const row = agg.get(sku);

    if (t.toLocation?.name === locationName) {
      row.in += t.qty || 0; totalIn += t.qty || 0;
    }
    if (t.fromLocation?.name === locationName) {
      row.out += t.qty || 0; totalOut += t.qty || 0;
    }
  }

  const bySku = Array.from(agg.entries()).map(([sku, v]) => ({
    sku, title: v.title, inbound: v.in, outbound: v.out, net: v.in - v.out,
  }));

  return json({
    locationName,
    bySku,
    totals: { inbound: totalIn, outbound: totalOut, net: totalIn - totalOut },
    recent,
    filters: { start: startStr, end: endStr },
  });
};

/* ----------------- UI ----------------- */
export default function LocationHistory() {
  const { locationName, bySku, totals, recent, filters } = useLoaderData();
  const fetcher = useFetcher();
  const navigate = useNavigate();

  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => setHydrated(true), []);

  const [start, setStart] = React.useState(filters.start || "");
  const [end, setEnd] = React.useState(filters.end || "");

  const apply = () => {
    const params = new URLSearchParams();
    if (start) params.set("start", start);
    if (end) params.set("end", end);
    navigate(`?${params.toString()}`);
  };

  const clear = () => {
    setStart(""); setEnd("");
    navigate(`?`);
  };

  const dtRows = bySku.map((r) => [
    r.title || "—",
    r.sku || "—",
    String(r.inbound || 0),
    String(r.outbound || 0),
    String(r.net || 0),
  ]);

  if (!hydrated) return <div />;

  return (
    <Page
      title={`Location: ${locationName}`}
      primaryAction={{ content: "Back", url: "/app/locations" }}
    >
      <Layout>
        {/* Filters */}
        <Layout.Section>
          <Box background="bg-surface" border="divider" radius="400" padding="400" style={{ borderRadius: 12 }}>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Filters</Text>
              <InlineStack gap="300" wrap={false}>
                <div style={{ width: 220 }}>
                  <TextField label="Start date" type="date" value={start} onChange={setStart} autoComplete="off" />
                </div>
                <div style={{ width: 220 }}>
                  <TextField label="End date" type="date" value={end} onChange={setEnd} autoComplete="off" />
                </div>
                <InlineStack gap="200">
                  <Button onClick={clear} disabled={!start && !end}>Clear</Button>
                  <Button variant="primary" onClick={apply}>Apply</Button>
                </InlineStack>
              </InlineStack>
            </BlockStack>
          </Box>
        </Layout.Section>

        {/* KPIs */}
        <Layout.Section>
          <Box background="bg-surface" border="divider" radius="400" padding="400" style={{ borderRadius: 12 }}>
            <InlineStack gap="400" wrap>
              <BlockStack><Text as="p" variant="headingMd">Inbound (qty)</Text><Text as="p" variant="headingLg">{totals.inbound}</Text></BlockStack>
              <BlockStack><Text as="p" variant="headingMd">Outbound (qty)</Text><Text as="p" variant="headingLg">{totals.outbound}</Text></BlockStack>
              <BlockStack><Text as="p" variant="headingMd">Net (in - out)</Text><Text as="p" variant="headingLg">{totals.net}</Text></BlockStack>
            </InlineStack>
          </Box>
        </Layout.Section>

        {/* Product breakdown */}
        <Layout.Section>
          <Box background="bg-surface" border="divider" radius="400" padding="400" style={{ borderRadius: 12 }}>
            <Text as="h2" variant="headingMd">Product breakdown</Text>
            <div style={{ height: "var(--p-space-200)" }} />
            {dtRows.length === 0 ? (
              <Banner tone="info" title="No data for this location">
                <p>There are no product movements for the selected range.</p>
              </Banner>
            ) : (
              <DataTable
                columnContentTypes={["text","text","numeric","numeric","numeric"]}
                headings={["Product","SKU","Inbound","Outbound","Net"]}
                rows={dtRows}
              />
            )}
          </Box>
        </Layout.Section>

        {/* Recent transfers */}
        <Layout.Section>
          <Box background="bg-surface" border="divider" radius="400" padding="400" style={{ borderRadius: 12 }}>
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">Recent transfers</Text>
              <Button url="/app/locations">Back</Button>
            </InlineStack>
            <div style={{ height: "var(--p-space-200)" }} />
            <TransfersTable rows={recent} />
          </Box>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
