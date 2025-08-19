import { useState, useEffect, useMemo } from "react";
import {
  Modal,
  BlockStack,
  InlineStack,
  TextField,
  Select,
  Banner,
  Button,
} from "@shopify/polaris";

export default function SaleModal({ open, onClose, locations = [], fetcher, isSubmitting }) {
  const locationOptions = useMemo(
    () => (locations || []).map((l) => ({ label: l, value: l })),
    [locations]
  );

  // Controlled fields
  const [location, setLocation] = useState(locationOptions[0]?.value ?? "");
  const [sku, setSku] = useState("");
  const [qty, setQty] = useState("1");
  const [value, setValue] = useState("");

  // Errors
  const [errLoc, setErrLoc] = useState();
  const [errSku, setErrSku] = useState();
  const [errQty, setErrQty] = useState();
  const [errValue, setErrValue] = useState();
  const [showBanner, setShowBanner] = useState(false);

  // ✅ Reset ONLY when modal opens (locations change pe mat reset karo)
  useEffect(() => {
    if (open) {
      const first = locationOptions[0]?.value ?? "";
      setLocation(first);
      setSku("");
      setQty("1");
      setValue("");
      setErrLoc(undefined);
      setErrSku(undefined);
      setErrQty(undefined);
      setErrValue(undefined);
      setShowBanner(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const validate = () => {
    let ok = true;
    setErrLoc(undefined);
    setErrSku(undefined);
    setErrQty(undefined);
    setErrValue(undefined);

    if (!location) { setErrLoc("Please select a location"); ok = false; }
    if (!sku?.trim()) { setErrSku("SKU is required"); ok = false; }

    const n = Number(qty);
    if (!qty || Number.isNaN(n) || n < 1) { setErrQty("Quantity must be 1 or more"); ok = false; }

    const val = Number(value);
    if (!value || Number.isNaN(val) || val < 0) { setErrValue("Value is required"); ok = false; }

    setShowBanner(!ok);
    return ok;
  };

  const submitForm = () => {
    if (!validate()) return;
    const f = document.getElementById("sale-form");
    if (f) f.requestSubmit();
  };

  const guardedClose = () => {
    if (showBanner) return; // keep open if validation failed
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={guardedClose}
      title="Log a sale"
      primaryAction={{ content: "Save", onAction: submitForm, loading: isSubmitting }}
      secondaryActions={[{ content: "Cancel", onAction: onClose }]}
    >
      <Modal.Section>
        {showBanner && (
          <BlockStack gap="200">
            <Banner tone="critical" title="Please fill all required fields">
              Make sure Location, SKU, Quantity and Value are provided.
            </Banner>
            <Button onClick={onClose}>Back to Dashboard</Button>
          </BlockStack>
        )}

        <fetcher.Form id="sale-form" method="post">
          <input type="hidden" name="intent" value="sale" />
          <BlockStack gap="300">
            <InlineStack gap="300" wrap>
              <Select
                label="Location"
                name="location"
                options={locationOptions}
                value={location}
                onChange={(v) => { setLocation(v); setErrLoc(undefined); }}
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
          </BlockStack>
        </fetcher.Form>
      </Modal.Section>
    </Modal>
  );
}
