#!/usr/bin/env node
// Builds the Claude Desktop extension bundle (.mcpb):
//   1. Single-file CJS server bundle (tsup.mcpb.config.ts — all deps inlined)
//   2. manifest.json generated from mcpb/manifest.template.json + package.json version
//   3. Validate + pack via the pinned @anthropic-ai/mcpb CLI (npx, ephemeral —
//      the CLI is deliberately NOT a devDependency: its tree carries audit
//      findings we don't want in this package's dependency graph)
//
// Output: dist-mcpb/cycles-mcp-server-<version>.mcpb
import { execSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  cpSync,
  rmSync,
} from "node:fs";

const MCPB_CLI = "@anthropic-ai/mcpb@2.1.2";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });

const { version } = JSON.parse(readFileSync("package.json", "utf8"));

// Full clean: tsup's `clean` only wipes server/ — stale docs or manifest
// files from earlier builds would otherwise be packed silently.
rmSync("build-mcpb", { recursive: true, force: true });

run("npx tsup --config tsup.mcpb.config.ts");
if (!existsSync("build-mcpb/server/index.cjs")) {
  console.error("bundle missing: build-mcpb/server/index.cjs");
  process.exit(1);
}

// docs/ ships inside the bundle so the cycles://docs/* resources resolve
// (../docs relative to server/index.cjs).
cpSync("docs", "build-mcpb/docs", { recursive: true });

// License compliance for a distributed artifact: Apache-2.0 §4(a) requires
// recipients receive a copy of this project's license, and the inlined
// dependencies' MIT licenses require their full permission notices — the
// bundler strips comments, so the notices must ship as files.
cpSync("LICENSE", "build-mcpb/LICENSE");

const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const notices = ["# Third-Party Notices", "", "This bundle inlines the following packages:", ""];
for (const [path, info] of Object.entries(lock.packages)) {
  if (path === "" || info.dev || info.extraneous) continue;
  const name = path.replace(/^.*node_modules\//, "");
  notices.push(`---`, ``, `## ${name}@${info.version} (${info.license ?? "unknown license"})`, ``);
  const licenseFile = ["LICENSE", "LICENSE.md", "LICENSE.txt", "LICENCE", "license", "License.md"]
    .map((f) => `${path}/${f}`)
    .find((f) => existsSync(f));
  if (licenseFile) {
    notices.push(readFileSync(licenseFile, "utf8").trim(), "");
  } else {
    notices.push(`(No license file shipped in the package; declared license: ${info.license ?? "unknown"}.)`, "");
  }
}
writeFileSync("build-mcpb/THIRD-PARTY-NOTICES.md", notices.join("\n"));
const missing = notices.filter((l) => l.startsWith("(No license file")).length;
console.log(`Third-party notices: ${Object.entries(lock.packages).filter(([p, i]) => p !== "" && !i.dev && !i.extraneous).length} packages, ${missing} without license files`);

const manifest = readFileSync("mcpb/manifest.template.json", "utf8").replace(
  "__VERSION__",
  version,
);
writeFileSync("build-mcpb/manifest.json", manifest);

run(`npx -y ${MCPB_CLI} validate build-mcpb/manifest.json`);

mkdirSync("dist-mcpb", { recursive: true });
const out = `dist-mcpb/cycles-mcp-server-${version}.mcpb`;
run(`npx -y ${MCPB_CLI} pack build-mcpb ${out}`);
console.log(`MCPB bundle: ${out}`);
