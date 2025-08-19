import { Card, Text, BlockStack, InlineStack } from "@shopify/polaris";

export default function KpiCard({ label, value, hint }) {
  return (
    <Card>
      <BlockStack gap="200">
        <Text as="span" variant="bodySm" tone="subdued">{label}</Text>
        <InlineStack align="start" blockAlign="center" gap="200">
          <Text as="h3" variant="headingXl">{value}</Text>
          {hint ? <Text as="span" tone="subdued" variant="bodySm">{hint}</Text> : null}
        </InlineStack>
      </BlockStack>
    </Card>
  );
}
