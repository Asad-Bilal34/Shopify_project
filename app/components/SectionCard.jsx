import React from "react";
import { Box, InlineStack, Text } from "@shopify/polaris";

export default function SectionCard({ title, right = null, children }) {
  return (
    <Box
      background="bg-surface"
      border="divider"
      radius="400"
      padding="400"
      style={{ borderRadius: 12 }}
    >
      {/* 🔹 Title (left) + Right slot (dropdown) same row */}
      <InlineStack align="space-between" blockAlign="center" wrap={false}>
        <Text as="h2" variant="headingMd">{title}</Text>
        <div style={{ minWidth: 260 }}>{right}</div>
      </InlineStack>

      <div style={{ height: "var(--p-space-200)" }} />
      {children}
    </Box>
  );
}
