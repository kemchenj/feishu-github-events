import { defineConfig } from "rolldown";

export default defineConfig({
  input: "src/index.ts",
  platform: "node",
  tsconfig: "./tsconfig.json",
  transform: {
    target: "node24"
  },
  output: {
    file: "dist/index.js",
    format: "esm",
    sourcemap: false
  },
  external: [/^node:/]
});
