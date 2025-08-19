// app/services/bootstrap.server.js
import { prisma } from "../db.server.js";
import { shopifyGraphQL } from "./shopify-graphql.server.js";

export async function ensureBootstrap() {
  const s = await prisma.setting.findUnique({ where: { id: 1 } });
  if (!s) {
    await prisma.setting.create({
      data: {
        id: 1,
        warehouseLocationGID: process.env.WAREHOUSE_LOCATION_GID || "gid://shopify/Location/0",
        autoSyncOrders: false,
        invoiceBranding: "Virtual Inventory",
      },
    });
  }

  // DEFAULT virtual locations (safe upserts)
  const defaults = [
    // { name: "Pop-up Karachi", type: "popup" },
    // { name: "Stockist A", type: "stockist" },
    // { name: "Rep South", type: "rep" },
    // { name: "Pop-up Lahore", type: "popup" },
    // retail/outlet destinations
    { name: "AlFateh", type: "outlet" },
    { name: "Imtiaz", type: "outlet" },
    { name: "Metro", type: "outlet" },
    { name: "GreenValley", type: "outlet" }, // ✅ typo fixed
  ];

  for (const d of defaults) {
    await prisma.virtualLocation.upsert({
      where: { name: d.name },
      update: {},
      create: { name: d.name, type: d.type },
    });
  }

  // One-time: migrate old typo "GreenVelly" → "GreenValley" if exists
  try {
    const oldOne = await prisma.virtualLocation.findUnique({ where: { name: "GreenVelly" } });
    const correct = await prisma.virtualLocation.findUnique({ where: { name: "GreenValley" } });
    if (oldOne && !correct) {
      await prisma.virtualLocation.update({
        where: { name: "GreenVelly" },
        data: { name: "GreenValley" },
      });
    }
  } catch {}
}

export async function getValidWarehouseGID(admin) {
  const s = await prisma.setting.findUnique({ where: { id: 1 } });
  let gid = s?.warehouseLocationGID;

  async function isValid(id) {
    if (!id || id === "gid://shopify/Location/0") return false;
    try {
      const data = await shopifyGraphQL(
        admin,
        `query($id: ID!) { node(id:$id) { id __typename } }`,
        { id }
      );
      return !!data?.node?.id && data.node.__typename === "Location";
    } catch { return false; }
  }

  if (!(await isValid(gid))) {
    try {
      const data = await shopifyGraphQL(
        admin,
        `query { locations(first:1) { edges { node { id } } } }`
      );
      const fallback = data?.locations?.edges?.[0]?.node?.id || null;
      if (fallback) {
        gid = fallback;
        await prisma.setting.update({
          where: { id: 1 },
          data: { warehouseLocationGID: gid },
        });
      } else {
        gid = null;
      }
    } catch { gid = null; }
  }

  return gid;
}
