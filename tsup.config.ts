import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  dts: true,
  entry: {
    "bin/conformance": "src/bin/conformance.ts",
    index: "src/index.ts",
  },
  format: ["esm", "cjs"],
  outExtension({ format }) {
    return { js: format === "esm" ? ".js" : ".cjs" };
  },
  sourcemap: true,
  splitting: false,
  target: "node20",
  treeshake: true,
});
