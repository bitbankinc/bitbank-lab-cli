#!/usr/bin/env node
// Sync version from package.json to plugin manifests.
// Invoked by .github/workflows/release.yml after `npm version --no-git-tag-version`
// so the published tarball carries matching plugin manifest versions.
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
  "plugin.json",
];

const versionRegex = /("version"\s*:\s*")[^"]+(")/;

let changed = 0;
for (const rel of targets) {
  const path = join(root, rel);
  const before = readFileSync(path, "utf8");
  if (!versionRegex.test(before)) {
    console.error(`sync-version: no version field found in ${rel}`);
    process.exit(1);
  }
  const after = before.replace(versionRegex, `$1${version}$2`);
  if (after === before) continue;
  writeFileSync(path, after);
  console.log(`  ${rel} -> ${version}`);
  changed++;
}
console.log(`sync-version: ${changed}/${targets.length} files synced to ${version}`);
