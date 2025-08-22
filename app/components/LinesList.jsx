import React from "react";
import { ResourceList, InlineStack, Avatar, BlockStack, Text, TextField, Button } from "@shopify/polaris";

/** Selected lines list with qty + remove */
export default function LinesList({ lines, onQtyChange, onRemove }) {
  return (
    <ResourceList
      resourceName={{ singular: "line", plural: "lines" }}
      items={lines}
      renderItem={(l) => (
        <ResourceList.Item id={l.sku}>
          <InlineStack align="space-between" blockAlign="center" wrap>
            <InlineStack gap="300" blockAlign="center">
              <Avatar customer size="medium" />
              <BlockStack gap="050">
                <Text variant="bodyMd">{l.name}</Text>
                <Text variant="bodySm" tone="subdued">{l.sku}</Text>
                <Text variant="bodySm">Available: {l.available}</Text>
              </BlockStack>
            </InlineStack>

            <InlineStack gap="200" blockAlign="center">
              <TextField
                label=""
                type="number"
                min={0}
                value={String(l.qty ?? 0)}
                onChange={(v) => onQtyChange(l.sku, v)}
                error={l.qty > l.available ? "Exceeds available" : undefined}
                autoComplete="off"
              />
              <Button tone="critical" onClick={() => onRemove(l.sku)}>Remove</Button>
            </InlineStack>
          </InlineStack>
        </ResourceList.Item>
      )}
    />
  );
}
