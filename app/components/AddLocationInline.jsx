import { useState, useEffect, useRef } from "react";
import { useFetcher } from "@remix-run/react";
import { Button, Modal, TextField, Text } from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";

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

  // show toast when a location gets added (same behavior)
  useEffect(() => {
    if (fetcher.data?.ok && fetcher.data.intent === "addLocation" && !lock.current) {
      lock.current = true;
      app.toast.show("Location added", { duration: 1800 });
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
