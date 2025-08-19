// app/services/inventory-snapshot.server.js
import { prisma } from "../db.server.js";
import { shopifyGraphQL } from "./shopify-graphql.server.js";

/**
 * Returns:
 *  {
 *    snapshot: [{ title, sku, available, virtual, productGid }],
 *    inStock: number,
 *    locationName: string
 *  }
 *
 * - Attempt A: location.inventoryLevels (fastest & most accurate)
 * - Attempt B: productVariants -> inventoryItem.inventoryLevels (fallback)
 * - If still empty: 1 row with friendly message
 */
export async function fetchInventorySnapshot(admin, locationGID) {
  let rows = [];
  let locationName = "";

  if (locationGID) {
    // -------- Attempt A: location.inventoryLevels ----------
    try {
      let hasNext = true;
      let after = null;

      while (hasNext && rows.length < 200) {
        const data = await shopifyGraphQL(
          admin,
          `
          query($id: ID!, $after: String) {
            location(id: $id) {
              name
              inventoryLevels(first: 50, after: $after) {
                edges {
                  cursor
                  node {
                    quantities(names: ["available"]) { name quantity }
                    item {
                      sku
                      variant {
                        product { id title }
                      }
                    }
                  }
                }
                pageInfo { hasNextPage endCursor }
              }
            }
          }`,
          { id: locationGID, after }
        );

        locationName = data?.location?.name || locationName;

        const edges = data?.location?.inventoryLevels?.edges || [];
        for (const e of edges) {
          const item = e?.node?.item;
          const sku = item?.sku || null;
          if (!sku) continue;

          const available =
            e?.node?.quantities?.find((q) => q.name === "available")?.quantity ?? 0;

          rows.push({
            title: item?.variant?.product?.title || sku,
            sku,
            available: Number(available || 0),
            virtual: 0, // fill later
            productGid: item?.variant?.product?.id || null,
          });
        }

        hasNext = data?.location?.inventoryLevels?.pageInfo?.hasNextPage || false;
        after = data?.location?.inventoryLevels?.pageInfo?.endCursor || null;
      }
    } catch (e) {
      console.log("[snapshot] Attempt A failed → fallback B", e?.message || e);
    }

    // -------- Attempt B: variants → levels (same-location match) ----------
    if (rows.length === 0) {
      try {
        const bySku = new Map();
        let hasNext = true;
        let after = null;

        while (hasNext && bySku.size < 200) {
          const res = await shopifyGraphQL(
            admin,
            `
            query($after: String) {
              productVariants(first: 50, after: $after, query: "status:active") {
                edges {
                  cursor
                  node {
                    sku
                    product { id title }
                    inventoryItem {
                      inventoryLevels(first: 50) {
                        edges {
                          node {
                            location { id }
                            quantities(names: ["available"]) { name quantity }
                          }
                        }
                      }
                    }
                  }
                }
                pageInfo { hasNextPage endCursor }
              }
            }`,
            { after }
          );

          for (const edge of res?.productVariants?.edges || []) {
            const v = edge?.node;
            const sku = v?.sku;
            if (!sku || bySku.has(sku)) continue;

            let available = 0;
            for (const lev of v?.inventoryItem?.inventoryLevels?.edges || []) {
              if (lev?.node?.location?.id === locationGID) {
                available =
                  lev?.node?.quantities?.find((q) => q.name === "available")?.quantity ?? 0;
                break;
              }
            }

            bySku.set(sku, {
              title: v?.product?.title || sku,
              sku,
              available: Number(available || 0),
              virtual: 0,
              productGid: v?.product?.id || null,
            });
          }

          hasNext = res?.productVariants?.pageInfo?.hasNextPage || false;
          after = res?.productVariants?.pageInfo?.endCursor || null;
        }

        rows = Array.from(bySku.values());
      } catch (e) {
        console.log("[snapshot] Attempt B failed", e?.message || e);
      }
    }
  }

  // -------- Virtual totals from app DB (sum per SKU) ----------
  const virtualAgg = await prisma.virtualStock.groupBy({
    by: ["sku"],
    _sum: { qty: true },
  });
  const virtualMap = new Map(
    virtualAgg.map((v) => [v.sku, Number(v._sum?.qty || 0)])
  );

  // -------- Adjust Shopify available by warehouse transfers (out - in) ----------
  // Net flow per SKU for the *selected Shopify location* name (if we have it)
  const whAdjBySku = new Map();
  if (locationGID) {
    // we already captured locationName above in Attempt A; if fallback B used, try to fetch it
    if (!locationName) {
      try {
        const d = await shopifyGraphQL(
          admin,
          `query($id: ID!) { node(id:$id) { ... on Location { name } } }`,
          { id: locationGID }
        );
        locationName = d?.node?.name || "";
      } catch {}
    }

    if (locationName) {
      const transfers = await prisma.transfer.findMany({
        where: {
          OR: [
            { fromLocation: { is: { name: locationName } } },
            { toLocation:   { is: { name: locationName } } },
          ],
        },
        include: { fromLocation: true, toLocation: true },
      });

      for (const t of transfers) {
        const sku = t.sku;
        let adj = whAdjBySku.get(sku) || 0; // +inbound, -outbound
        if (t.fromLocation?.name === locationName) adj -= Number(t.qty || 0);
        if (t.toLocation?.name === locationName)   adj += Number(t.qty || 0);
        whAdjBySku.set(sku, adj);
      }
    }
  }

  // attach virtual totals and adjusted available
  rows = rows.map((r) => {
    const delta = Number(whAdjBySku.get(r.sku) || 0);
    const adjustedAvailable = Math.max(0, Number(r.available || 0) + delta);
    return {
      ...r,
      available: adjustedAvailable,
      virtual: Number(virtualMap.get(r.sku) || 0),
    };
  });

  // sort (desc by available) + top 10 for dashboard
  rows = rows.sort((a, b) => (b.available || 0) - (a.available || 0)).slice(0, 10);

  // graceful empty state
  if (rows.length === 0) {
    const label = locationGID
      ? (locationName
          ? `No inventory levels tracked at “${locationName}”`
          : `No inventory levels tracked for selected location`)
      : `No Shopify location selected`;
    rows = [{ title: label, sku: "—", available: 0, virtual: 0, productGid: null }];
  }

  const inStock = rows.reduce((sum, r) => sum + Number(r.available || 0), 0);

  return { snapshot: rows, inStock, locationName };
}
