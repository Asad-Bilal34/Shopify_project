import { useEffect, useState } from "react";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page, Layout, Card, BlockStack, InlineStack, Text, Select, Button,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import { prisma } from "../db.server.js";
import { ensureBootstrap } from "../services/bootstrap.server.js";
import { listShopifyLocations } from "../services/locations.server.js";

// ---------- LOADER ----------
export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  await ensureBootstrap();

  const settings =
    (await prisma.setting.findUnique({ where: { id: 1 } })) ||
    { warehouseLocationGID: "", autoSyncOrders: false, invoiceBranding: "" };

  const locations = await listShopifyLocations(admin);
  return json({ settings, locations });
};

// ---------- ACTION ----------
export const action = async ({ request }) => {
  await authenticate.admin(request);
  await ensureBootstrap();

  const form = await request.formData();
  const warehouseLocationGID = String(form.get("warehouseLocationGID") || "");

  // Keep backend fields but we don't show them in UI anymore
  await prisma.setting.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      warehouseLocationGID: warehouseLocationGID || "gid://shopify/Location/0",
      autoSyncOrders: false,
      invoiceBranding: "",
    },
    update: {
      warehouseLocationGID: warehouseLocationGID || "gid://shopify/Location/0",
    },
  });

  return json({ ok: true });
};

// ---------- COMPONENT ----------
export default function SettingsRoute() {
  const { settings, locations } = useLoaderData();
  const fetcher = useFetcher();
  const app = useAppBridge();
  const navigate = useNavigate();

  const [warehouseGID, setWarehouseGID] = useState(settings?.warehouseLocationGID || "");

  useEffect(() => { if (fetcher.data?.ok) app.toast.show("Settings saved"); }, [fetcher.data, app]);

  const locationOptions =
    (locations || []).map(l => ({ label: l.name, value: l.id })) ||
    [{ label: "No locations found", value: "" }];

  return (
    <Page>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center" wrap>
          <Text as="h1" variant="headingLg">Settings</Text>
          <InlineStack gap="200" wrap>
            <Button onClick={() => navigate("/app")}>Dashboard</Button>
            <Button onClick={() => navigate("/app/transfers")}>Transfers</Button>
            <Button onClick={() => navigate("/app/sales")}>Sales</Button>
            <Button onClick={() => navigate("/app/reports")}>Reports</Button>
            <Button onClick={() => navigate("/app/locations")}>Locations</Button>
          </InlineStack>
        </InlineStack>
      </BlockStack>

      <Layout>
        <Layout.Section>
          <Card>
            <fetcher.Form method="post">
              <BlockStack gap="400">
                <Text as="h3" variant="headingMd">Warehouse location</Text>
                <Select
                  label="Shopify location"
                  name="warehouseLocationGID"
                  options={locationOptions}
                  value={warehouseGID}
                  onChange={setWarehouseGID}
                />
                <InlineStack gap="300">
                  <Button submit variant="primary">Save settings</Button>
                </InlineStack>
              </BlockStack>
            </fetcher.Form>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
