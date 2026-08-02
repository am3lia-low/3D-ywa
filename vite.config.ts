import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "react-runtime",
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 30,
            },
            {
              name: "three-core",
              test: /node_modules[\\/]three[\\/]/,
              priority: 25,
              maxSize: 420_000,
            },
            {
              name: "r3f-runtime",
              test: /node_modules[\\/](@react-three|three-stdlib)[\\/]/,
              priority: 20,
              maxSize: 420_000,
            },
            {
              name: "vendor",
              test: /node_modules[\\/]/,
              priority: 10,
              maxSize: 420_000,
            },
          ],
        },
      },
    },
  },
  test: {
    environment: "node",
    coverage: {
      reporter: ["text", "json-summary"],
    },
  },
});
