import { useState } from "react";
import {
  Modal,
  BlockStack,
  InlineStack,
  Select,
  TextField,
  Button,
  Text,
} from "@shopify/polaris";
import ProductPicker from "./ProductPicker";

/**
 * props (tumhare jaisay):
 *  - open, onClose
 *  - fetcher, isSubmitting
 *  - fromOptions, toOptions
 *  - products: [{title, sku, available}]  // picker ke liye
 */
export default function TransferModal({
  open,
  onClose,
  fetcher,
  isSubmitting,
  fromOptions = [],
  toOptions = [],
  products = [],
}) {
  const [from, setFrom] = useState(fromOptions[0] || "");
  const [to, setTo] = useState(toOptions[0] || "");
  const [sku, setSku] = useState("");
  const [qty, setQty] = useState("");
  const [notes, setNotes] = useState("");

  const submit = () => {
    const fd = new FormData();
    fd.append("intent", "transfer");       // ✅ tumhara existing intent
    fd.append("from", from);
    fd.append("to", to);
    fd.append("sku", sku);
    fd.append("qty", qty);
    fd.append("notes", notes || "");
    fetcher.submit(fd, { method: "post" }); // ✅ tumhara existing submit
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Log transfer"
      primaryAction={{
        content: "Save",
        onAction: submit,
        loading: isSubmitting,
        disabled: !from || !to || !sku || !qty,
      }}
      secondaryActions={[{ content: "Cancel", onAction: onClose }]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          <InlineStack gap="400">
            <Select label="Origin" options={fromOptions} value={from} onChange={setFrom} />
            <Select label="Destination" options={toOptions} value={to} onChange={setTo} />
          </InlineStack>

          {/* Shopify-like Product Picker */}
          <ProductPicker
            products={products}
            onSelect={(p) => { setSku(p?.sku || ""); }}
          />

          <InlineStack gap="400">
            <TextField
              label="SKU"
              value={sku}
              onChange={setSku}
              autoComplete="off"
              placeholder="Selected from picker or type manually"
            />
            <TextField
              label="Qty"
              type="number"
              min={0}
              value={qty}
              onChange={setQty}
              autoComplete="off"
            />
          </InlineStack>

          <TextField
            label="Notes"
            value={notes}
            onChange={setNotes}
            multiline={3}
            autoComplete="off"
          />

          <Text tone="subdued" variant="bodySm">
            * Abhi sirf UI add kiya hai; advanced functionality baad me wire kar lenge.
          </Text>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
