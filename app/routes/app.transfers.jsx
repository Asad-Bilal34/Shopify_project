// app/routes/app.transfers.jsx
import React from "react";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Box,
  BlockStack,
  InlineStack,
  Text,
  Select,
  TextField,
  Button,
  Modal,
  ResourceList,
  Avatar,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getDashboardData } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const data = await getDashboardData(admin);
  return json({
    warehouseName: data.warehouseName || "Warehouse",
    locations: data.locations || [],
  });
};

export default function TransfersLayout() {
  const { warehouseName, locations } = useLoaderData();

  // Origin fixed value (enabled look, single option)
  const origin = warehouseName;

  // Destination options (your logic)
  const destOptions = Array.from(
    new Set(["AlFateh", "Imtiaz", "Metro", "GreenValley", ...locations])
  )
    .filter((x) => x && x !== origin)
    .map((x) => ({ label: x, value: x }));

  const [destination, setDestination] = React.useState(
    destOptions[0]?.value || ""
  );
  const [notes, setNotes] = React.useState("");
  const [dateCreated, setDateCreated] = React.useState(
    new Date().toISOString().slice(0, 10)
  );
  const [referenceName, setReferenceName] = React.useState("");
  const [tags, setTags] = React.useState("");
  const [searchQ, setSearchQ] = React.useState("");

  // Product picker (dummy data for now)
  const [productPickerOpen, setProductPickerOpen] = React.useState(false);
  const [selectedProducts, setSelectedProducts] = React.useState([]);
  const products = [
    { id: "1", name: "Product A", sku: "SKU001" },
    { id: "2", name: "Product B", sku: "SKU002" },
  ];
  const handleProductSelect = (product) => {
    if (!selectedProducts.find((p) => p.id === product.id)) {
      setSelectedProducts((prev) => [...prev, product]);
    }
  };

  return (
    <Page title="Create transfer">
      <Layout>
        {/* LEFT: Origin/Destination + Add products */}
        <Layout.Section>
          <Box background="bg-surface" border="divider" radius="500" padding="400">
            <BlockStack gap="400">
              <InlineStack gap="400" wrap>
                <Box minWidth="300px" width="100%">
                  <Select
                    label="Origin"
                    options={[{ label: origin, value: origin }]} // single option
                    value={origin}
                    onChange={() => {}} // no-op (value fixed)
                    helpText="Origin is your selected location."
                  />
                </Box>
                <Box minWidth="300px" width="100%">
                  <Select
                    label="Destination"
                    options={destOptions}
                    value={destination}
                    onChange={setDestination}
                    placeholder="Select destination"
                  />
                </Box>
              </InlineStack>
            </BlockStack>
          </Box>

          {/* spacer */}
          <div style={{ height: "var(--p-space-400)" }} />

          {/* Add products */}
          <Box background="bg-surface" border="divider" radius="300" padding="400">
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Add products
              </Text>

              <InlineStack gap="200" wrap>
                <Box width="100%">
                  <TextField
                    label=""
                    placeholder="Search products"
                    value={searchQ}
                    onChange={setSearchQ}
                    autoComplete="off"
                  />
                </Box>
                <Button onClick={() => setProductPickerOpen(true)}>Browse</Button>
                <Button>Import</Button>
                <Button icon="HorizontalDotsMinor" disabled />
              </InlineStack>

              {selectedProducts.length > 0 && (
                <ResourceList
                  resourceName={{ singular: "product", plural: "products" }}
                  items={selectedProducts}
                  renderItem={(item) => {
                    const { id, name, sku } = item;
                    return (
                      <ResourceList.Item id={id} accessibilityLabel={`View ${name}`}>
                        <Avatar customer size="medium" />
                        <div>
                          <Text variant="bodyMd">{name}</Text>
                          <Text variant="bodySm" tone="subdued">
                            {sku}
                          </Text>
                        </div>
                      </ResourceList.Item>
                    );
                  }}
                />
              )}
            </BlockStack>
          </Box>
        </Layout.Section>

        {/* RIGHT: Notes -> Transfer details -> Tags */}
        <Layout.Section variant="oneThird">
          <Box background="bg-surface" border="divider" radius="300" padding="400">
            <Text as="h2" variant="headingMd">
              Notes
            </Text>
            <Box>
              <TextField
                label=""
                value={notes}
                onChange={setNotes}
                placeholder="No notes"
                multiline={4}
                autoComplete="off"
              />
            </Box>
          </Box>

          <div style={{ height: "var(--p-space-400)" }} />

          <Box background="bg-surface" border="divider" radius="300" padding="400">
            <Text as="h2" variant="headingMd">
              Transfer details
            </Text>
            <BlockStack gap="300">
              <TextField
                label="Date created"
                type="date"
                value={dateCreated}
                onChange={setDateCreated}
                autoComplete="off"
              />
              <TextField
                label="Reference name"
                value={referenceName}
                onChange={setReferenceName}
                autoComplete="off"
              />
            </BlockStack>
          </Box>

          <div style={{ height: "var(--p-space-400)" }} />

          <Box background="bg-surface" border="divider" radius="300" padding="400">
            <Text as="h2" variant="headingMd">
              Tags
            </Text>
            <Box>
              <TextField
                label=""
                value={tags}
                onChange={setTags}
                maxLength={40}
                autoComplete="off"
                placeholder="0/40"
              />
            </Box>
          </Box>
        </Layout.Section>
      </Layout>

      {/* Browse Modal */}
      <Modal
        open={productPickerOpen}
        onClose={() => setProductPickerOpen(false)}
        title="Select products"
        primaryAction={{
          content: "Done",
          onAction: () => setProductPickerOpen(false),
        }}
      >
        <Modal.Section>
          <ResourceList
            resourceName={{ singular: "product", plural: "products" }}
            items={products}
            renderItem={(item) => {
              const { id, name, sku } = item;
              return (
                <ResourceList.Item
                  id={id}
                  accessibilityLabel={`Select ${name}`}
                  onClick={() => handleProductSelect(item)}
                >
                  <Avatar customer size="medium" />
                  <div>
                    <Text variant="bodyMd">{name}</Text>
                    <Text variant="bodySm" tone="subdued">
                      {sku}
                    </Text>
                  </div>
                </ResourceList.Item>
              );
            }}
          />
        </Modal.Section>
      </Modal>
    </Page>
  );
}
