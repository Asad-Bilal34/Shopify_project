import { useState, useEffect, useRef } from "react";
import { useFetcher } from "@remix-run/react";
import { Button, Modal, TextField, Text } from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";

// --- Toast-once helpers (inline, no new file) ---
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

/**
 * Add Location with Popup (Modal)
 * - "Add location" button opens modal
 * - Input + Save posts intent=addLocation to the *current route*
 * - Toast + close on success (logic unchanged)
 */
export default function AddLocationInline() {
  const [active, setActive] = useState(false);
  const [name, setName] = useState("");
  const fetcher = useFetcher();
  const app = useAppBridge();
  const lock = useRef(false);

  // submit par toast pending mark (so reload pe repeat na ho)
  useEffect(() => {
    if (fetcher.state === "submitting") {
      markSubmitPending("addLocation");
    }
  }, [fetcher.state]);

  // show toast when a location gets added (same behavior) — gated once
  useEffect(() => {
    if (fetcher.data?.ok && fetcher.data.intent === "addLocation" && !lock.current) {
      lock.current = true;
      if (shouldShowToastOnce("addLocation")) {
        app.toast.show("Location added", { duration: 1800 });
      }
      setName("");
      setActive(false);
      setTimeout(() => (lock.current = false), 2000);
    }
  }, [fetcher.data, app]);

  const save = () => {
    const trimmed = String(name || "").trim();
    if (!trimmed) return;
    const fd = new FormData();
    fd.set("intent", "addLocation");
    fd.set("name", trimmed);
    fetcher.submit(fd, { method: "POST" });
  };

  return (
    <>
      <Button onClick={() => setActive(true)}>Add location</Button>

      <Modal
        open={active}
        onClose={() => { setActive(false); setName(""); }}
        title="Add a new location"
        primaryAction={{
          content: "Save",
          onAction: save,
          loading: fetcher.state !== "idle",
        }}
        secondaryActions={[
          { content: "Cancel", onAction: () => { setActive(false); setName(""); } },
        ]}
      >
        <Modal.Section>
          <TextField
            label="Location name"
            autoComplete="off"
            value={name}
            onChange={setName}
            placeholder="Type location name"
          />
          {fetcher.data?.error ? (
            <Text tone="critical" variant="bodySm" as="p" >
              {fetcher.data.error}
            </Text>
          ) : null}
        </Modal.Section>
      </Modal>
    </>
  );
}
