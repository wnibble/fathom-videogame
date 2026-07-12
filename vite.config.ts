import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

// FATHOM — pixel-art bullet-diver. Vite dev/build config.
export default defineConfig({
  base: "./",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
  build: {
    target: "es2022",
    outDir: "dist",
  },
});
