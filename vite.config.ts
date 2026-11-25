import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // GitHub Pages serves this project page from /show-me-where/.
  base: "/show-me-where/",
  plugins: [react()],
  test: {
    environment: "node",
    // Let tests read the stylesheet as text (the contrast test checks its colour tokens).
    css: { include: [/styles\.css/] },
  },
});
