// app/services/sales.server.js
import { prisma } from "../db.server.js";
import { shopifyGraphQL } from "./shopify-graphql.server.js";

async function findVariantBySKU(admin, sku) {
  const data = await shopifyGraphQL(
    admin,
    `
    query($q: String!) {
      productVariants(first: 1, query: $q) {
        edges { node { id sku product { title } } }
      }
    }`,
    { q: `sku:${sku}` }
  );
  const node = data?.productVariants?.edges?.[0]?.node;
  return node ? { id: node.id, sku: node.sku } : null;
}

async function createDraftOrderForSale(admin, items) {
  const input = {
    lineItems: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
    tags: ["Virtual Sale"],
    note: "Created by Virtual Inventory app",
  };

  const created = await shopifyGraphQL(
    admin,
    `
    mutation($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder { id }
        userErrors { field message }
      }
    }`,
    { input }
  );
  const draftId = created?.draftOrderCreate?.draftOrder?.id;
  if (!draftId) return null;

  const completed = await shopifyGraphQL(
    admin,
    `
    mutation($id: ID!) {
      draftOrderComplete(id: $id, paymentPending: true) {
        order { id name }
        userErrors { message }
      }
    }`,
    { id: draftId }
  );

  return completed?.draftOrderComplete?.order?.id || draftId;
}

async function getOrCreateLocationByName(name) {
  const existing = await prisma.virtualLocation.findUnique({ where: { name } });
  if (existing) return existing;
  return prisma.virtualLocation.create({ data: { name } });
}

async function adjustVirtualStock(locationId, sku, deltaQty) {
  const current = await prisma.virtualStock.findUnique({
    where: { locationId_sku: { locationId, sku } },
  });
  if (!current) {
    return prisma.virtualStock.create({
      data: { locationId, sku, qty: Math.max(0, deltaQty) },
    });
  }
  return prisma.virtualStock.update({
    where: { locationId_sku: { locationId, sku } },
    data: { qty: Math.max(0, current.qty + deltaQty) },
  });
}

export async function logSale({ admin, locationName, sku, qty, value }) {
  const loc = await getOrCreateLocationByName(locationName);
  const q = Math.max(1, Number(qty) || 0);
  const val = value != null ? Number(value) || null : null;

  await adjustVirtualStock(loc.id, sku, -q);

  let orderGID = null;
  const settings = await prisma.setting.findUnique({ where: { id: 1 } });
  if (settings?.autoSyncOrders) {
    const variant = await findVariantBySKU(admin, sku);
    if (variant?.id) {
      orderGID = await createDraftOrderForSale(admin, [{ variantId: variant.id, quantity: q }]);
    }
  }

  await prisma.sale.create({
    data: { locationId: loc.id, sku, qty: q, value: val, shopifyOrderId: orderGID || null },
  });

  return orderGID;
}

export async function listRecentSales(limit = 10) {
  const sales = await prisma.sale.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { location: true },
  });

  return sales.map((s) => [
    s.createdAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    s.location.name,
    String(s.qty),
    s.value != null ? `PKR ${s.value.toLocaleString()}` : "—",
  ]);
}
