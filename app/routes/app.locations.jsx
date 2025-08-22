import React from "react";
import { json } from "@remix-run/node";
import {
  Link,
  useFetcher,
  useLoaderData,
  useRevalidator,
} from "@remix-run/react";
import {
  Page,
  Layout,
  Box,
  BlockStack,
  InlineStack,
  Text,
  TextField,
  Button,
  ResourceList,
  Avatar,
  Banner,
  Modal,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getDashboardData } from "../shopify.server";
import { prisma } from "../db.server.js";

/* -------- Toast-once helpers -------- */
function markSubmitPending(intentKey = "generic") {
  if (typeof window === "undefined") return;
  const kPending = `__toast_pending_${intentKey}`;
  const kConsumed = `__toast_consumed_${intentKey}`;
  try {
    sessionStorage.setItem(kPending, "1");
    sessionStorage.removeItem(kConsumed);
  } catch {}
}
function shouldShowToastOnce(intentKey = "generic") {
  if (typeof window === "undefined") return true;
  const kPending = `__toast_pending_${intentKey}`;
  const kConsumed = `__toast_consumed_${intentKey}`;
  try {
    const wasPending = sessionStorage.getItem(kPending) === "1";
    if (!wasPending) return false;
    sessionStorage.removeItem(kPending);
    if (sessionStorage.getItem(kConsumed)) return false;
    sessionStorage.setItem(kConsumed, "1");
    return true;
  } catch {
    return true;
  }
}

/* ----------------- LOADER ----------------- */
export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const data = await getDashboardData(admin);

  const warehouseName = data?.warehouseName || "Warehouse";
  const virtual = await prisma.virtualLocation.findMany({
    orderBy: { name: "asc" },
  });

  return json({
    warehouseName,
    virtualLocations: virtual.map((v) => ({ id: v.id, name: v.name })),
  });
};

/* ----------------- ACTION ----------------- */
export const action = async ({ request }) => {
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "create") {
    const name = String(form.get("name") || "").trim();
    if (!name)
      return json({ ok: false, error: "Name required" }, { status: 400 });

    const created = await prisma.virtualLocation.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    return json({
      ok: true,
      intent,
      location: { id: created.id, name: created.name },
    });
  }

  if (intent === "rename") {
    const id = Number(form.get("id") || 0);
    const name = String(form.get("name") || "").trim();
    if (!id || !name)
      return json({ ok: false, error: "Invalid payload" }, { status: 400 });

    const exists = await prisma.virtualLocation.findFirst({ where: { name } });
    if (exists && exists.id !== id) {
      return json({ ok: false, error: "Name already exists" }, { status: 400 });
    }

    const updated = await prisma.virtualLocation.update({
      where: { id },
      data: { name },
    });
    return json({
      ok: true,
      intent,
      location: { id: updated.id, name: updated.name },
    });
  }

  if (intent === "delete") {
    const id = Number(form.get("id") || 0);
    if (!id) return json({ ok: false, error: "Invalid id" }, { status: 400 });
    await prisma.virtualLocation.delete({ where: { id } });
    return json({ ok: true, intent, id });
  }

  return json({ ok: false, error: "Unknown intent" }, { status: 400 });
};

/* ----------------- UI ----------------- */
export default function LocationsPage() {
  const { warehouseName, virtualLocations } = useLoaderData();
  const fetcher = useFetcher();
  const app = useAppBridge();
  const revalidator = useRevalidator();

  // HYDRATION FLAG
  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => setHydrated(true), []);

  // host/shop ko ek dafa cache kar lo (new-tab flows me help)
  React.useEffect(() => {
    try {
      const qs = new URLSearchParams(window.location.search);
      const host = qs.get("host");
      const shop = qs.get("shop");
      if (host) localStorage.setItem("__host", host);
      if (shop) localStorage.setItem("__shop", shop);
    } catch {}
  }, []);

  // local list so rename doesn't hard reload
  const [list, setList] = React.useState(virtualLocations || []);
  React.useEffect(() => {
    setList(virtualLocations || []);
  }, [virtualLocations]);

  const [search, setSearch] = React.useState("");
  const [newName, setNewName] = React.useState("");
  const [renameId, setRenameId] = React.useState(null);
  const [renameVal, setRenameVal] = React.useState("");
  const [confirm, setConfirm] = React.useState({
    open: false,
    id: null,
    name: "",
  });

  const submitting =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  React.useEffect(() => {
    if (fetcher.state === "submitting" && fetcher.formData) {
      const i = (fetcher.formData.get("intent") || "generic").toString();
      markSubmitPending(i);
    }
  }, [fetcher.state, fetcher.formData]);

  React.useEffect(() => {
    if (!fetcher.data) return;

    if (fetcher.data.ok) {
      const { intent } = fetcher.data;

      if (intent === "create") {
        if (shouldShowToastOnce(intent))
          app.toast.show("Location added", { duration: 1600 });
        if (fetcher.data.location) {
          setList((prev) => {
            const exists = prev.some((x) => x.id === fetcher.data.location.id);
            return exists
              ? prev
              : [...prev, fetcher.data.location].sort((a, b) =>
                  a.name.localeCompare(b.name),
                );
          });
        } else {
          revalidator.revalidate();
        }
        setNewName("");
      }

      if (intent === "rename") {
        if (shouldShowToastOnce(intent))
          app.toast.show("Location renamed", { duration: 1600 });
        const loc = fetcher.data.location;
        if (loc) {
          setList((prev) =>
            prev.map((x) => (x.id === loc.id ? { ...x, name: loc.name } : x)),
          );
        }
        setRenameId(null);
        setRenameVal("");
      }

      if (intent === "delete") {
        if (shouldShowToastOnce(intent))
          app.toast.show("Location deleted", { duration: 1600 });
        const delId = fetcher.data.id;
        setList((prev) => prev.filter((x) => x.id !== delId));
        setConfirm({ open: false, id: null, name: "" });
      }
    } else if (fetcher.data?.error) {
      if (shouldShowToastOnce("error")) {
        app.toast.show(fetcher.data.error, { duration: 2200, isError: true });
      }
    }
  }, [fetcher.data, app, revalidator]);

  const filtered = (list || []).filter((v) =>
    v.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const addLocation = () => {
    const name = newName.trim();
    if (!name) return;
    fetcher.submit({ intent: "create", name }, { method: "POST" });
  };

  const startRename = (loc) => {
    setRenameId(loc.id);
    setRenameVal(loc.name);
  };

  const saveRename = () => {
    const name = renameVal.trim();
    if (!renameId || !name) return;
    fetcher.submit(
      { intent: "rename", id: String(renameId), name },
      { method: "POST" },
    );
  };

  const deleteLocation = (id) => {
    fetcher.submit({ intent: "delete", id: String(id) }, { method: "POST" });
  };

  /* ---------- NEW-TAB OPEN (pehle App Bridge; phir fallback) ---------- */
  const shopFromHost = (host) => {
    try {
      const dec = atob(host || "");
      const domain = (dec.split("/")[0] || "").trim();
      return domain.endsWith(".myshopify.com") ? domain : "";
    } catch {
      return "";
    }
  };

  const getCtx = () => {
    const qs = new URLSearchParams(window.location.search);
    let host = qs.get("host") || localStorage.getItem("__host") || "";
    let shop = qs.get("shop") || localStorage.getItem("__shop") || "";
    if (!shop && host) shop = shopFromHost(host);
    return { host, shop };
  };

  const openLocationPage = React.useCallback(
    (id) => {
      const { host, shop } = getCtx();
      const base = `/app/locations/${encodeURIComponent(String(id))}`;

      // Redirect to the location page in the same tab
      const returnTo = host ? `${base}?host=${encodeURIComponent(host)}` : base;

      // Update the URL to reflect the new location page (same tab)
      window.history.pushState({}, "", returnTo); // This changes the URL without reloading the page
      window.location.reload(); // Optional, to force re-fetching data after the URL change
    },
    [getCtx]
  );

  if (!hydrated) return <div />;

  return (
    <Page title="Locations">
      <style>{`
        .soft-card{
          background: var(--p-color-bg-surface);
          border: 1px solid var(--p-color-border-subdued);
          border-radius: 12px;
          padding: 12px;
        }
      `}</style>

      <Layout>
        {/* Shopify Warehouse (read-only) */}
        <Layout.Section>
          <div className="soft-card">
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Shopify warehouse</Text>
              <Box>
                <ResourceList
                  resourceName={{ singular: "location", plural: "locations" }}
                  items={[{ id: "shopify-warehouse", name: warehouseName }]}
                  renderItem={(item) => (
                    <ResourceList.Item id={item.id}>
                      <InlineStack align="space-between" blockAlign="center">
                        <InlineStack gap="300" blockAlign="center">
                          <Avatar />
                          <Text variant="bodyMd">{item.name}</Text>
                        </InlineStack>
                        <Text tone="subdued">Read only</Text>
                      </InlineStack>
                    </ResourceList.Item>
                  )}
                />
              </Box>
            </BlockStack>
          </div>
        </Layout.Section>

        {/* Virtual Locations Manager */}
        <Layout.Section>
          <div className="soft-card">
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Virtual locations</Text>

              {/* Create + Search row */}
              <InlineStack gap="200" wrap={false}>
                <Box width="100%">
                  <TextField
                    label=""
                    placeholder="Add a new location (e.g., Imtiaz, Metro)"
                    value={newName}
                    onChange={setNewName}
                    onKeyDown={(e) => { if (e.key === "Enter") addLocation(); }}
                    autoComplete="off"
                  />
                </Box>
                <Button variant="primary" loading={submitting} onClick={addLocation}>Add</Button>

                <Box width="100%" style={{ maxWidth: 280 }}>
                  <TextField
                    label=""
                    placeholder="Search"
                    value={search}
                    onChange={setSearch}
                    autoComplete="off"
                  />
                </Box>
              </InlineStack>

              {/* List */}
              <Box>
                {filtered.length === 0 ? (
                  <Banner tone="info" title="No locations">
                    <p>Add your first virtual location above.</p>
                  </Banner>
                ) : (
                  <ResourceList
                    resourceName={{ singular: "location", plural: "locations" }}
                    items={filtered}
                    renderItem={(loc) => (
                      <ResourceList.Item id={String(loc.id)}>
                        <InlineStack align="space-between" blockAlign="center" wrap>
                          {/* name / rename */}
                          <InlineStack gap="300" blockAlign="center">
                            <Avatar />
                            {renameId === loc.id ? (
                              <TextField
                                label=""
                                value={renameVal}
                                onChange={setRenameVal}
                                autoComplete="off"
                                onBlur={saveRename}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveRename();
                                  if (e.key === "Escape") { setRenameId(null); setRenameVal(""); }
                                }}
                              />
                            ) : (
                              <Text variant="bodyMd">{loc.name}</Text>
                            )}
                          </InlineStack>

                          {/* actions */}
                          <InlineStack gap="200">
                            {renameId === loc.id ? (
                              <>
                                <Button onClick={() => { setRenameId(null); setRenameVal(""); }}>Cancel</Button>
                                <Button variant="primary" loading={submitting} onClick={saveRename}>Save</Button>
                              </>
                            ) : (
                              <>
                                <Link to={`/app/location/${loc.id}`}>View</Link>

                                <Button onClick={() => startRename(loc)}>Rename</Button>
                                <Button
                                  tone="critical"
                                  onClick={() => setConfirm({ open: true, id: loc.id, name: loc.name })}
                                >
                                  Delete
                                </Button>
                              </>
                            )}
                          </InlineStack>
                        </InlineStack>
                      </ResourceList.Item>
                    )}
                  />
                )}
              </Box>
            </BlockStack>
          </div>
        </Layout.Section>
      </Layout>

      {/* Delete confirm */}
      <Modal
        open={confirm.open}
        onClose={() => setConfirm({ open: false, id: null, name: "" })}
        title="Delete location?"
        primaryAction={{
          content: "Delete",
          tone: "critical",
          onAction: () => deleteLocation(confirm.id),
          loading: submitting,
        }}
        secondaryActions={[{
          content: "Cancel",
          onAction: () => setConfirm({ open: false, id: null, name: "" }),
        }]}
      >
        <Modal.Section>
          <Text>
            This will permanently remove <b>{confirm.name}</b>.
          </Text>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
