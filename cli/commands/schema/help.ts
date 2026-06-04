import { ALL_SCHEMAS } from "./registry.js";
import type { ParamProp, SchemaDef } from "./types.js";

function formatParam(name: string, def: ParamProp): string {
  const parts: string[] = [];
  parts.push(`  --${name}`);
  parts.push(`  Type: ${def.type}`);
  parts.push(`  ${def.description}`);
  if (def.enum) parts.push(`  Values: ${def.enum.join(", ")}`);
  if (def.default !== undefined) parts.push(`  Default: ${def.default}`);
  return parts.join("\n");
}

/** Print subcommand help. Returns true if handled. */
export function showCommandHelp(command: string, description: string): boolean {
  const text = buildHelp(command, description);
  if (!text) return false;
  console.log(text);
  return true;
}

export function buildHelp(command: string, description: string): string | null {
  const schema = ALL_SCHEMAS[command];
  if (!schema) return null;

  const invocation = schema.category === "trade" ? `trade ${command}` : command;
  const lines: string[] = [];
  lines.push(`Usage: bitbank ${invocation} [options]\n`);
  lines.push(`${description}\n`);
  lines.push(`Category: ${schema.category}\n`);

  const params = Object.entries(schema.params);
  if (params.length > 0) {
    lines.push("Parameters:");
    for (const [name, def] of params) {
      lines.push(formatParam(name, def));
      lines.push("");
    }
  } else {
    lines.push("Parameters: (none)\n");
  }

  lines.push("Examples:");
  lines.push(`  bitbank ${invocation}${exampleArgs(command, schema)}`);
  lines.push(`  bitbank ${invocation}${exampleArgs(command, schema)} --format=table`);

  return lines.join("\n");
}

function exampleArgs(_command: string, schema: SchemaDef): string {
  const parts: string[] = [];
  for (const [name, def] of Object.entries(schema.params)) {
    if (def.default !== undefined) continue;
    if (name === "execute" || name === "confirm") continue;
    const val = exampleValue(name, def);
    if (val !== null) parts.push(`--${name}=${val}`);
  }
  return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}

function exampleValue(name: string, def: ParamProp): string | null {
  if (def.enum) return def.enum[0];
  if (name === "pair") return "btc_jpy";
  if (name === "asset") return "btc";
  if (name === "date") return "20250101";
  if (name === "from") return "20250101";
  if (name === "to") return "20250131";
  if (def.type === "boolean") return null;
  return null;
}
