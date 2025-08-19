import { vitePlugin as remix } from "@remix-run/dev";
import { installGlobals } from "@remix-run/node";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

installGlobals({ nativeFetch: true });

/**
 * Shopify CLI env normalization
 * (same as your code – unchanged)
 */
if (
  process.env.HOST &&
  (!process.env.SHOPIFY_APP_URL ||
    process.env.SHOPIFY_APP_URL === process.env.HOST)
) {
  process.env.SHOPIFY_APP_URL = process.env.HOST;
  delete process.env.HOST;
}

const host = new URL(process.env.SHOPIFY_APP_URL || "http://localhost").hostname;

/**
 * HMR config:
 * - localhost -> ws + fixed clientPort
 * - remote host (Cloudflare domain) -> wss + clientPort 443
 *   (logic same as before)
 */
let hmrConfig;
if (host === "localhost") {
  hmrConfig = {
    protocol: "ws",
    host: "localhost",
    port: 64999,
    clientPort: 64999,
  };
} else {
  hmrConfig = {
    protocol: "wss",
    host: host,
    port: parseInt(process.env.FRONTEND_PORT) || 8002, // unchanged
    clientPort: 443,
  };
}

export default defineConfig({
  server: {
    /**
     * 🔐 IMPORTANT for tunnel:
     * - host: true => 0.0.0.0 (external access allowed)
     * - strictPort: true => hamesha yahi port (no random fallback)
     */
    host: true,
    strictPort: true,

    allowedHosts: [host],
    cors: { preflightContinue: true },

    // keep your port logic; set PORT in .env to lock it (e.g. 3000)
    port: Number(process.env.PORT || 3000),

    hmr: hmrConfig,

    fs: {
      // unchanged
      allow: ["app", "node_modules"],
    },
  },
  plugins: [
    remix({
      ignoredRouteFiles: ["**/.*"],
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
        v3_lazyRouteDiscovery: true,
        v3_singleFetch: false,
        v3_routeConfig: true,
      },
    }),
    tsconfigPaths(),
  ],
  build: {
    assetsInlineLimit: 0,
  },
  optimizeDeps: {
    include: ["@shopify/app-bridge-react", "@shopify/polaris"],
  },
});
