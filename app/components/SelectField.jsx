import React from "react";
import { Box, BlockStack, Text, Popover, OptionList, InlineStack, Icon } from "@shopify/polaris";
import { ChevronDownIcon } from "@shopify/polaris-icons";

/** Shopify-like compact Select (Popover + OptionList) */
export default function SelectField({ label, helpText, value, options, onChange, placeholder }) {
  const [open, setOpen] = React.useState(false);
  const selected = value ? [value] : [];
  const display = options.find((o) => o.value === value)?.label || placeholder || "";

  return (
    <BlockStack gap="150">
      {label ? <Text as="p" variant="bodySm" tone="subdued">{label}</Text> : null}

      <Popover
        active={open}
        onClose={() => setOpen(false)}
        preferredAlignment="left"
        fullWidth
        activator={
          <Box
            onClick={() => setOpen(true)}
            background="bg-surface"
            border="divider"
            radius="400"
            padding="300"
            minHeight="46px"
            width="100%"
            role="button"
            tabIndex={0}
          >
            <InlineStack align="space-between" blockAlign="center">
              <Text as="span" variant="bodyMd">{display}</Text>
              <Icon source={ChevronDownIcon} />
            </InlineStack>
          </Box>
        }
      >
        <Box minWidth="280px">
          <OptionList
            options={options}
            selected={selected}
            onChange={(sel) => { onChange(sel?.[0] ?? ""); setOpen(false); }}
          />
        </Box>
      </Popover>

      {helpText ? <Text as="p" variant="bodySm" tone="subdued">{helpText}</Text> : null}
    </BlockStack>
  );
}
