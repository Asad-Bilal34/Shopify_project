import React, { useEffect, useRef, useState } from "react";
import { Form, useLoaderData } from "@remix-run/react";
import {
  AppProvider as PolarisAppProvider,
  Button,
  Card,
  FormLayout,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import polarisTranslations from "@shopify/polaris/locales/en.json";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { json } from "@remix-run/node";
import { login } from "../../shopify.server";

// Polaris CSS
export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

/**
 * GET: sirf UI/params de do — yahan login(request) MAT call karo
 * query: ?shop=...&host=...&return_to=...
 */
export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shopQS = url.searchParams.get("shop") || "";
  const hostQS = url.searchParams.get("host") || "";
  const returnTo = url.searchParams.get("return_to") || "";

  return json({
    polarisTranslations,
    shopQS,
    hostQS,
    returnTo,
  });
};

/**
 * POST: yahin par login(request) call karo (redirect yahin se hoga)
 * Body double-read error yahin se bachta hai.
 */
export const action = async ({ request }) => {
  // Shopify helper khud formData padhta hai aur redirect/response return karta hai
  return await login(request);
};

export default function Auth() {
  const { polarisTranslations, shopQS, hostQS, returnTo } = useLoaderData();

  const [shop, setShop] = useState(shopQS || "");
  const formRef = useRef(null);

  // 1) return_to ko localStorage me save karo taa-ke post-auth me wahi page khule
  // 2) agar shop query me diya hua hai to form ko auto-submit kar do
  useEffect(() => {
    try {
      if (returnTo) localStorage.setItem("__rt", returnTo);
      if (shopQS) {
        // thoda micro-delay taa-ke Polaris mount ho jaye
        setTimeout(() => {
          formRef.current?.submit();
        }, 0);
      }
    } catch {}
  }, [shopQS, returnTo]);

  return (
    <PolarisAppProvider i18n={polarisTranslations}>
      <Page>
        <Card>
          <Form method="post" ref={formRef}>
            {/* host ko bhi POST me bhej do taa-ke context preserve rahe */}
            {hostQS ? <input type="hidden" name="host" value={hostQS} /> : null}
            {/* return_to ko optional field ke taur par bhej sakte ho (lib ignore kare to bhi ok) */}
            {returnTo ? (
              <input type="hidden" name="return_to" value={returnTo} />
            ) : null}

            <FormLayout>
              <Text variant="headingMd" as="h2">
                Log in
              </Text>

              <TextField
                type="text"
                name="shop"
                label="Shop domain"
                helpText="example.myshopify.com"
                value={shop}
                onChange={setShop}
                autoComplete="on"
              />

              <Button submit>Log in</Button>
            </FormLayout>
          </Form>
        </Card>
      </Page>
    </PolarisAppProvider>
  );
}
