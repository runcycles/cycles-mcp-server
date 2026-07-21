import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const { version } = JSON.parse(readFileSync("package.json", "utf8")) as {
  version: string;
};

// Single-file CJS bundle for the MCPB desktop extension: all dependencies
// inlined so the .mcpb needs no node_modules, and CJS output so bundled CJS
// deps (express) never hit ESM dynamic-require failures. The version is
// injected because the bundle ships without package.json and import.meta.url
// is unavailable in CJS.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  dts: false,
  sourcemap: false,
  clean: true,
  target: "node20",
  platform: "node",
  outDir: "build-mcpb/server",
  noExternal: [/./],
  define: {
    __MCPB_VERSION__: JSON.stringify(version),
  },
});
