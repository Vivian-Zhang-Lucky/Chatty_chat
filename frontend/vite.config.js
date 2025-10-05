import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ["@dashlane/pqc-kem-kyber512-browser"]
  },
  assetsInclude: ['**/*.wasm'],
});
