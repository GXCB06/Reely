import path from "node:path";
import { defineConfig } from "vitest/config";

// "@/…" as in tsconfig, so tests can import app modules that use the alias.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
});
