import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    server: {
      host: "127.0.0.1",
      proxy: {
        "/api/v2": {
          target: "http://127.0.0.1:8765",
          // Keep the host and origin so Python can reject cross-origin POSTs.
          changeOrigin: false,
        },
      },
    },
    optimizeDeps: {
      include: ["framer-motion", "@tanstack/react-query"],
      ignoreOutdatedRequests: false,
    },
  },
  tanstackStart: {
    server: { entry: "server" },
  },
});
