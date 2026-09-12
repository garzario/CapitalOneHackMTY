import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * The API runs as a separate process on 3000. Proxying /api and /health here
 * means the browser only ever talks to one origin, so there is no CORS story
 * to debug in development and no base URL to configure in the client.
 */
const API_ORIGIN = "http://localhost:3000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: API_ORIGIN, changeOrigin: true },
      "/health": { target: API_ORIGIN, changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
