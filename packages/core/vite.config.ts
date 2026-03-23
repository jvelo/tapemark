import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [
    preact(),
    dts({ rollupTypes: true }),
  ],
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: "index",
    },
    rollupOptions: {
      external: ["preact", "preact/jsx-runtime", "preact-render-to-string"],
    },
  },
});
