import { json } from "@remix-run/node";
import { useEffect, useState } from "react";
import { useFetcher, useLoaderData, useRevalidator } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  DataTable,
  Button,
  TextField,
  Text,
  BlockStack,
  InlineStack,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import { prisma } from "../db.server.js";
import AddLocationInline from "../components/AddLocationInline";

// ---------- LOADER ----------
export const loader = async ({ request }) => {
  await authenticate.admin(request);
  const locations = await prisma.virtualLocation.findMany({
    orderBy: { createdAt: "desc" }, // latest first
  });
  return json({ locations });
};

// ---------- ACTION ----------
export const action = async ({ request }) => {
  await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "addLocation") {
    const raw = String(form.get("name") || "").trim();
    if (!raw) return json({ ok: false, intent, error: "Name required" }, { status: 400 });
    try {
      await prisma.virtualLocation.create({ data: { name: raw } });
      return json({ ok: true, intent });
    } catch (err) {
      if (err?.code === "P2002") {
        return json({ ok: false, intent, error: "A location with this name already exists." }, { status: 400 });
      }
      return json({ ok: false, intent, error: "Failed to add location." }, { status: 500 });
    }
  }

  if (intent === "editLocation") {
    const id = Number(form.get("id"));
    const newName = String(form.get("name") || "").trim();
    if (!id || !newName) {
      return json({ ok: false, intent, error: "Invalid data" }, { status: 400 });
    }
    try {
      await prisma.virtualLocation.update({ where: { id }, data: { name: newName } });
      return json({ ok: true, intent });
    } catch (err) {
      if (err?.code === "P2002") {
        return json({ ok: false, intent, error: "A location with this name already exists." }, { status: 400 });
      }
      return json({ ok: false, intent, error: "Failed to update location." }, { status: 500 });
    }
  }

  if (intent === "deleteLocation") {
    const id = Number(form.get("id"));
    if (!id) return json({ ok: false, intent, error: "Invalid id" }, { status: 400 });
    await prisma.virtualLocation.delete({ where: { id } });
    return json({ ok: true, intent });
  }

  return json({ ok: false, intent, error: "Unknown intent" }, { status: 400 });
};

// ---------- COMPONENT ----------
export default function LocationsPage() {
  const { locations } = useLoaderData();
  const fetcher = useFetcher();
  const revalidator = useRevalidator();
  const app = useAppBridge();

  const [editing, setEditing] = useState(null); // id | null
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    const d = fetcher.data;
    if (!d) return;
    if (d.ok) {
      if (d.intent === "addLocation") app.toast.show("Location added", { duration: 1600 });
      if (d.intent === "editLocation") app.toast.show("Location updated", { duration: 1600 });
      if (d.intent === "deleteLocation") app.toast.show("Location deleted", { duration: 1600 });
      revalidator.revalidate();
    } else if (d?.error) {
      app.toast.show(d.error, { duration: 1800, isError: true });
    }
  }, [fetcher.data, app, revalidator]);

  const handleRefresh = () => revalidator.revalidate();

  const rows = (locations || []).map((loc) => {
    const isEditing = editing === loc.id;

    const nameCell = isEditing ? (
      <TextField
        autoFocus
        labelHidden
        label="Location name"
        value={editValue}
        onChange={setEditValue}
      />
    ) : (
      <Text as="span">{loc.name}</Text>
    );

    // only date (YYYY-MM-DD)
    const createdDate = new Date(loc.createdAt).toISOString().split("T")[0];

    const actionsCell = isEditing ? (
      <InlineStack gap="200">
        <Button
          size="slim"
          onClick={() => {
            const fd = new FormData();
            fd.append("intent", "editLocation");
            fd.append("id", String(loc.id));
            fd.append("name", editValue);
            fetcher.submit(fd, { method: "post" });
            setEditing(null);
          }}
        >
          Save
        </Button>
        <Button size="slim" onClick={() => { setEditing(null); setEditValue(""); }}>
          Cancel
        </Button>
      </InlineStack>
    ) : (
      <InlineStack gap="200">
        <Button size="slim" onClick={() => { setEditing(loc.id); setEditValue(loc.name); }}>
          Edit
        </Button>
        <fetcher.Form
          method="post"
          replace
          onSubmit={(e) => { if (!confirm("Delete this location?")) e.preventDefault(); }}
        >
          <input type="hidden" name="intent" value="deleteLocation" />
          <input type="hidden" name="id" value={loc.id} />
          <Button tone="critical" size="slim" variant="plain" submit>
            Delete
          </Button>
        </fetcher.Form>
      </InlineStack>
    );

    return [nameCell, createdDate, actionsCell];
  });

  return (
    <Page>
      {/* Top nav: active page = Locations, so show Dashboard instead of Locations */}
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center" wrap>
          <Text as="h1" variant="headingLg">Locations</Text>
          <InlineStack gap="200" wrap>
            <Button onClick={handleRefresh}>Refresh</Button>
            <Button url="/app">Dashboard</Button>
            <Button url="/app/transfers">Transfers</Button>
            <Button url="/app/sales">Sales</Button>
            <Button url="/app/reports">Reports</Button>
            <Button url="/app/settings">Settings</Button>
            {/* ⚠️ Locations button intentionally hidden on Locations page */}
          </InlineStack>
        </InlineStack>
      </BlockStack>

      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between">
                <Text variant="headingLg" as="h2">Add location</Text>
                <AddLocationInline />
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text variant="headingMd" as="h3">Recent Locations</Text>
              <DataTable
                columnContentTypes={["text", "text", "text"]}
                headings={["Name", "Created Date", "Actions"]}
                rows={rows}
              />
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
