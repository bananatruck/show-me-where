import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // GitHub Pages serves this project page from /show-me-where/.
  base: "/show-me-where/",
  plugins: [react()],
  test: {
    environment: "node",
  },
});
