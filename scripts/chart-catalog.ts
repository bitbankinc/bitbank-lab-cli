// chart-catalog.json のビルダー。skills/*/SKILL.md の「## 可視化」節にある
// 標準チャート表（先頭列が `<skill>.<slug>` の ID）を単一ソースとして集約する。
// gen-agents-catalog.ts から呼ばれ、chaos x17 が committed との差分ゼロを検査する。
// 表の構造規約（ID の prefix 一致・一意性・共有ガイド参照）は chaos s11 が検査する。
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GUIDE = "skills/_shared/references/visualization-guide.md";

function realSkillDirs(): string[] {
  const dir = join(ROOT, "skills");
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
    .map((e) => e.name)
    .filter((name) => existsSync(join(dir, name, "SKILL.md")))
    .sort();
}

/** 「## 可視化」見出しから次の H2 見出しまで（s11 と同じ切り出し規則） */
function vizSection(content: string): string | null {
  const m = content.match(/^## 可視化[^\n]*$/m);
  if (m?.index === undefined) return null;
  const rest = content.slice(m.index + m[0].length);
  const next = rest.search(/\n## /);
  return next === -1 ? rest : rest.slice(0, next);
}

/** 標準チャート表の行 `| \`<id>\` | <title> | <spec> |` を抽出する */
function parseCharts(skill: string, section: string) {
  const rows: { id: string; skill: string; title: string; spec: string }[] = [];
  const re = /^\|\s*`([a-z][a-z0-9-]*\.[a-z][a-z0-9-]*)`\s*\|([^|]+)\|([^|]+)\|/gm;
  for (const m of section.matchAll(re)) {
    rows.push({ id: m[1], skill, title: m[2].trim(), spec: m[3].trim() });
  }
  return rows;
}

export function buildChartCatalog() {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
    version: string;
  };
  const charts = realSkillDirs().flatMap((skill) => {
    const content = readFileSync(join(ROOT, "skills", skill, "SKILL.md"), "utf8");
    const section = vizSection(content);
    return section ? parseCharts(skill, section) : [];
  });
  return {
    schema_version: "1.0",
    cli_version: pkg.version,
    generator: "scripts/gen-agents-catalog.ts",
    description:
      "Machine-readable chart catalog for the bitbank-lab-cli Agent Skills. Generated from the 可視化 (visualization) sections of skills/*/SKILL.md. Each chart is a stable ID (`<skill>.<slug>`; renaming is a breaking change) plus its spec. Rendering conventions (opt-in trigger discipline, matplotlib resolution, output path/naming, style, provenance footer, safety rules) are defined in the shared guide — charts are opt-in and never replace text output. Do not edit by hand — run `npx tsx scripts/gen-agents-catalog.ts`.",
    visualization_guide: GUIDE,
    default_behavior: "off (opt-in only; see visualization_guide trigger discipline)",
    chart_count: charts.length,
    skills_with_charts: [...new Set(charts.map((c) => c.skill))],
    charts,
  };
}
