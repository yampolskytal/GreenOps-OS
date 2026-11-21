// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// Never set ssr.external or resolve.external: the Worker has no runtime module resolution, so
// the build fails. Never add compression (compressPublicAssets, vite-plugin-compression):
// hosting already compresses at the edge.
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    server: {
      // Local GreenOps Python backend (backend/app.py serve). The backend refuses
      // cross-origin writes, so drop the browser Origin header on proxied calls.
      proxy: {
        "/api": {
          target: process.env["GREENOPS_BACKEND_URL"] ?? "http://127.0.0.1:8765",
          changeOrigin: true,
          configure: (proxy) => proxy.on("proxyReq", (req) => req.removeHeader("origin")),
        },
      },
    },
    optimizeDeps: {
      // Discover route-only hook consumers with React before navigation; stale
      // optimizer requests must reload, not create a second React dispatcher.
      include: ["framer-motion", "@tanstack/react-query"],
      ignoreOutdatedRequests: false,
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
