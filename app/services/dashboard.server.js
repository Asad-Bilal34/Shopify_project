// app/services/dashboard.server.js
import { prisma } from "../db.server.js";
import { shopifyGraphQL } from "./shopify-graphql.server.js";
import { ensureBootstrap, getValidWarehouseGID } from "./bootstrap.server.js";
import { fetchInventorySnapshot } from "./inventory-snapshot.server.js";
import { listRecentTransfers } from "./transfers.server.js";
import { listRecentSales } from "./sales.server.js";

export async function getDashboardData(admin) {
  await ensureBootstrap();
  const locationGID = await getValidWarehouseGID(admin);

  // products count (approx)
  const productsData = await shopifyGraphQL(
    admin,
    `
    query($after: String) {
      products(first: 50, after: $after, sortKey: UPDATED_AT) {
        edges { cursor node { id } }
        pageInfo { hasNextPage endCursor }
      }
    }`
  );
  const products = productsData?.products?.edges?.length || 0;

  // snapshot + totals for selected location
  const { snapshot, inStock, locationName } =
    await fetchInventorySnapshot(admin, locationGID);

  // counts
  const virtualLocations = await prisma.virtualLocation.count();
  const pendingTransfers = 0;

  // locations list (first = Shopify location name if available) — make unique
  const appLocations = await prisma.virtualLocation.findMany({ select: { name: true } });
  const raw = [locationName || "Location", ...appLocations.map((l) => l.name)];
  const seen = new Set();
  const locations = raw
    .map((n) => String(n || "").trim())
    .filter((n) => {
      if (!n || seen.has(n)) return false;
      seen.add(n);
      return true;
    });

  return {
    stats: { products, virtualLocations, inStock, pendingTransfers },
    inventorySnapshot: snapshot,
    recentTransfers: await listRecentTransfers(10),
    recentSales: await listRecentSales(10),
    locations,
    warehouseName: locationName || null,
  };
}
