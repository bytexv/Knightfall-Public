import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { pgnCompatibility } from "./scripts/pgn-compat";
export default defineConfig({
  plugins: [pgnCompatibility(), react()],
  optimizeDeps: { exclude: ["chess.js"] },
  base: "./",
  server: { host: "0.0.0.0", allowedHosts: true },
  build: { chunkSizeWarningLimit: 1500 },
});
