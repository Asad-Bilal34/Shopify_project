// app/services/transfers.server.js
import { prisma } from "../db.server.js";

async function getOrCreateLocationByName(name) {
  const clean = String(name || "").trim();
  const existing = await prisma.virtualLocation.findUnique({ where: { name: clean } });
  if (existing) return existing;
  return prisma.virtualLocation.create({ data: { name: clean } });
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

export async function logTransfer({ fromName, toName, sku, qty, notes }) {
  // Normalize names (no behavioural change, just safer)
  const from = await getOrCreateLocationByName(fromName);
  const to = await getOrCreateLocationByName(toName);
  const q = Math.max(1, Number(qty) || 0);

  // STOCK MINUS from "from", PLUS to "to"
  await adjustVirtualStock(from.id, sku, -q);
  await adjustVirtualStock(to.id, sku, +q);

  await prisma.transfer.create({
    data: { fromLocationId: from.id, toLocationId: to.id, sku, qty: q, notes },
  });
}

export async function listRecentTransfers(limit = 10) {
  const transfers = await prisma.transfer.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { fromLocation: true, toLocation: true },
  });

  return transfers.map((t) => [
    t.createdAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    `${t.fromLocation.name} → ${t.toLocation.name}`,
    t.sku,
    String(t.qty),
    t.notes || "",
  ]);
}
