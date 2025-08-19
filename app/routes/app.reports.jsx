import { useState } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useRevalidator } from "@remix-run/react";
import {
  Page,
  Layout,
  BlockStack,
  InlineStack,
  Card,
  Text,
  Tabs,
  Button,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";

// UI sections
import SectionCard from "../components/SectionCard";
import InventoryTable from "../components/InventoryTable";
import TransfersTable from "../components/TransfersTable";
import SalesTable from "../components/SalesTable";

// Server services (real data)
import { ensureBootstrap, getValidWarehouseGID } from "../services/bootstrap.server.js";
import { fetchInventorySnapshot } from "../services/inventory-snapshot.server.js";
import { listRecentTransfers } from "../services/transfers.server.js";
import { listRecentSales } from "../services/sales.server.js";

/* ----------------------------- LOADER (server) ----------------------------- */
export const loader = async ({ request }) => {
  // auth + bootstrap
  const { admin } = await authenticate.admin(request);
  await ensureBootstrap();

  // resolve valid Shopify location GID + fetch live snapshot
  const locationGID = await getValidWarehouseGID(admin);
  const { snapshot, locationName } = await fetchInventorySnapshot(admin, locationGID);

  // recent activity from DB
  const transfers = await listRecentTransfers(50);
  const sales = await listRecentSales(50);

  return json({
    inventory: snapshot,          // [["Title","available","virtualTotal"], ...]
    transfers,                     // [["Date","From→To","SKU","Qty","Notes"], ...]
    sales,                         // [["Date","Location","Items","Value"], ...]
    locationName,                  // for table heading
  });
};

/* ---------------------------- COMPONENT (client) --------------------------- */
export default function ReportsRoute() {
  const { inventory, transfers, sales, locationName } = useLoaderData();
  const [selected, setSelected] = useState(0);
  const navigate = useNavigate();
  const revalidator = useRevalidator();

  const tabs = [
    { id: "inventory", content: "Inventory", panelID: "inventory-panel" },
    { id: "transfers", content: "Transfers", panelID: "transfers-panel" },
    { id: "sales", content: "Sales", panelID: "sales-panel" },
  ];

  return (
    <Page>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center" wrap>
          <Text as="h1" variant="headingLg">Reports</Text>
          <InlineStack gap="200" wrap>
            <Button onClick={() => revalidator.revalidate()}>Refresh</Button>
            <Button onClick={() => navigate("/app")}>Dashboard</Button>
            <Button onClick={() => navigate("/app/transfers")}>Transfers</Button>
            <Button onClick={() => navigate("/app/sales")}>Sales</Button>
            <Button onClick={() => navigate("/app/settings")}>Settings</Button>
          </InlineStack>
        </InlineStack>
      </BlockStack>

      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Tabs tabs={tabs} selected={selected} onSelect={setSelected} />

              {selected === 0 && (
                <SectionCard>
                  {/* Inventory snapshot from Shopify location + virtual totals from DB */}
                  <InventoryTable rows={inventory} warehouseName={locationName} />
                </SectionCard>
              )}

              {selected === 1 && (
                <SectionCard>
                  {/* Recent transfers from DB */}
                  <TransfersTable rows={transfers} />
                </SectionCard>
              )}

              {selected === 2 && (
                <SectionCard>
                  {/* Recent sales from DB */}
                  <SalesTable rows={sales} />
                </SectionCard>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
