#!/usr/bin/env node
// Sync version from package.json to plugin manifests.
// Wired into `npm version` lifecycle via scripts.version in package.json,
// so `npm version patch` updates all 5 files in one commit.
// Regex (not JSON.parse → stringify) preserves each file's existing
// indentation and key order.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const targets = [
  ".claude-plugin/plugin.json",
  ".cursor-plugin/plugin.json",
  ".codex-plugin/plugin.json",
  "gemini-extension.json",
];

let changed = 0;
for (const rel of targets) {
  const path = join(root, rel);
  const before = readFileSync(path, "utf8");
  const after = before.replace(/("version"\s*:\s*")[^"]+(")/, `$1${version}$2`);
  if (after === before) continue;
  if (!/("version"\s*:\s*")[^"]+(")/.test(before)) {
    console.error(`sync-version: no version field found in ${rel}`);
    process.exit(1);
  }
  writeFileSync(path, after);
  console.log(`  ${rel} -> ${version}`);
  changed++;
}
console.log(`sync-version: ${changed}/${targets.length} files synced to ${version}`);
