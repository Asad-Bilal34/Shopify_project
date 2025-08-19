import React from "react";
import {
  Link,
  Outlet,
  useLoaderData,
  useRouteError,
  useLocation,
} from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "../shopify.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();
  const location = useLocation();

  // Toggle: show Dashboard link while on /app/locations, otherwise show Locations
  const onLocations = location.pathname.startsWith("/app/locations");

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      {/* Small global polish — does NOT change your logic */}
      <style>{`
        .app-shell { padding: 16px; }
        .app-shell .rounded-md { border-radius: 12px; }
      `}</style>

      <NavMenu>
        {onLocations ? (
          <Link to="/app" rel="home">Dashboard</Link>
        ) : (
          <Link to="/app/locations">Locations</Link>
        )}
        <Link to="/app/transfers">Transfers</Link>
        <Link to="/app/sales">Sales</Link>
        <Link to="/app/reports">Reports</Link>
        <Link to="/app/settings">Settings</Link>
      </NavMenu>

      {/* 👇 hydration mismatch warnings ko ignore karega (className/text diff) */}
      <main className="app-shell" suppressHydrationWarning>
        <Outlet />
      </main>
    </AppProvider>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
