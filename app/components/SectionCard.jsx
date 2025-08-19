import { Card, BlockStack, Text } from "@shopify/polaris";

export default function SectionCard({ title, children, gap = "300" }) {
  return (
    <Card>
      <BlockStack gap={gap}>
        {title ? (<Text as="h3" variant="headingMd">{title}</Text>) : null}
        {children}
      </BlockStack>
    </Card>
  );
}
