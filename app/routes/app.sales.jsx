import { useEffect, useMemo, useRef, useState } from "react";
import { json } from "@remix-run/node";
import {
  useFetcher,
  useLoaderData,
  useNavigate,
  useRevalidator,
} from "@remix-run/react";
import {
  Page,
  Layout,
  BlockStack,
  InlineStack,
  Card,
  Text,
  TextField,
  Select,
  Button,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import { prisma } from "../db.server.js";
import { ensureBootstrap } from "../services/bootstrap.server.js";
import { logSale, listRecentSales } from "../services/sales.server.js";
import SalesTable from "../components/SalesTable";

/* --------------------------- LOADER (server) --------------------------- */
export const loader = async ({ request }) => {
  try { await authenticate.admin(request); } catch {}
  await ensureBootstrap(); // ensure default malls exist

  const virtuals = await prisma.virtualLocation.findMany({
    select: { name: true },
    orderBy: { name: "asc" },
  });
  const all = virtuals.map((v) => v.name);

  const malls = ["AlFateh", "Imtiaz", "Metro", "GreenValley"];
  // restrict to malls; if any missing, they'll be created by bootstrap anyway
  const locations = all.filter((n) => malls.includes(n));

  const sales = await listRecentSales(20);

  return json({ locations, sales });
};

/* --------------------------- ACTION (server) --------------------------- */
export const action = async ({ request }) => {
  let admin;
  try {
    ({ admin } = await authenticate.admin(request));
  } catch {}

  const fd = await request.formData();
  const location = String(fd.get("location") || "");
  const sku = String(fd.get("sku") || "").trim();
  const qty = Number(fd.get("qty") || 0);
  const value = fd.get("value");
  const valNum = value === null || value === "" ? NaN : Number(value);

  if (!location || !sku || !qty || qty < 1 || Number.isNaN(valNum) || valNum < 0) {
    return json({ ok: false, error: "VALIDATION_FAILED" }, { status: 400 });
  }

  await logSale({
    admin,
    locationName: location,
    sku,
    qty,
    value: valNum,
  });

  return json({ ok: true });
};

/* ------------------------------ COMPONENT ----------------------------- */
export default function SalesRoute() {
  const { locations, sales } = useLoaderData();
  const fetcher = useFetcher();
  const app = useAppBridge();
  const navigate = useNavigate();
  const revalidator = useRevalidator();

  // Restrict to shopping malls
  const mallLocations = useMemo(
    () => (locations || []),
    [locations]
  );

  const locationOptions = useMemo(
    () => (mallLocations || []).map((l) => ({ label: l, value: l })),
    [mallLocations]
  );

  const [loc, setLoc] = useState(locationOptions[0]?.value ?? "");
  const [sku, setSku] = useState("");
  const [qty, setQty] = useState("1");
  const [value, setValue] = useState("");

  const [errLoc, setErrLoc] = useState();
  const [errSku, setErrSku] = useState();
  const [errQty, setErrQty] = useState();
  const [errValue, setErrValue] = useState();

  const toastLock = useRef(false);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok && !toastLock.current) {
      toastLock.current = true;
      app.toast.show("Sale logged", { duration: 2000 });
      revalidator.revalidate();
      setSku("");
      setQty("1");
      setValue("");
      setTimeout(() => (toastLock.current = false), 2200);
    }
  }, [fetcher.state, fetcher.data, app, revalidator]);

  const validate = () => {
    let ok = true;
    setErrLoc(undefined);
    setErrSku(undefined);
    setErrQty(undefined);
    setErrValue(undefined);

    if (!loc) { setErrLoc("Please select a location"); ok = false; }
    if (!sku.trim()) { setErrSku("SKU is required"); ok = false; }

    const q = Number(qty);
    if (!qty || Number.isNaN(q) || q < 1) { setErrQty("Quantity must be 1 or more"); ok = false; }

    const v = Number(value);
    if (value === "" || Number.isNaN(v) || v < 0) { setErrValue("Value is required"); ok = false; }

    return ok;
  };

  const onSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    const form = e.currentTarget;
    fetcher.submit(new FormData(form), { method: "POST" });
  };

  return (
    <Page>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center" wrap>
          <Text as="h1" variant="headingLg">Sales logging</Text>
          <InlineStack gap="200" wrap>
            <Button onClick={() => navigate("/app")}>Dashboard</Button>
            <Button onClick={() => navigate("/app/transfers")}>Transfers</Button>
            <Button onClick={() => navigate("/app/reports")}>Reports</Button>
            <Button onClick={() => navigate("/app/settings")}>Settings</Button>
            <Button onClick={() => navigate("/app/locations")}>Locations</Button>
          </InlineStack>
        </InlineStack>
      </BlockStack>

      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <form method="post" onSubmit={onSubmit}>
                <BlockStack gap="300">
                  <InlineStack gap="300" wrap>
                    <Select
                      label="Location"
                      name="location"
                      options={locationOptions}
                      value={loc}
                      onChange={(v) => { setLoc(v); setErrLoc(undefined); }}
                      error={errLoc}
                      requiredIndicator
                    />
                    <TextField
                      label="SKU / Product"
                      name="sku"
                      autoComplete="off"
                      value={sku}
                      onChange={(v) => { setSku(v); setErrSku(undefined); }}
                      error={errSku}
                      requiredIndicator
                    />
                  </InlineStack>
                  <InlineStack gap="300" wrap>
                    <TextField
                      label="Quantity"
                      name="qty"
                      type="number"
                      min="1"
                      inputMode="numeric"
                      value={qty}
                      onChange={(v) => { setQty(v); setErrQty(undefined); }}
                      error={errQty}
                      requiredIndicator
                    />
                    <TextField
                      label="Value (PKR)"
                      name="value"
                      type="number"
                      min="0"
                      inputMode="decimal"
                      value={value}
                      onChange={(v) => { setValue(v); setErrValue(undefined); }}
                      error={errValue}
                      requiredIndicator
                    />
                  </InlineStack>
                  <InlineStack gap="300">
                    <Button submit loading={fetcher.state !== "idle"}>Log sale</Button>
                  </InlineStack>
                </BlockStack>
              </form>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">Recent sales</Text>
              <SalesTable rows={sales} />
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
