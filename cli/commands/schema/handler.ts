import { output } from "../../output.js";
import type { CommandHandler } from "../handler-types.js";
import { ALL_SCHEMAS } from "./registry.js";
import type { SchemaDef } from "./types.js";

function toParamsJsonSchema(params: SchemaDef["params"]): object {
  const properties: Record<string, object> = {};
  const required: string[] = [];
  for (const [name, def] of Object.entries(params)) {
    const prop: Record<string, unknown> = { type: def.type, description: def.description };
    if (def.enum) prop.enum = def.enum;
    if (def.default !== undefined) prop.default = def.default;
    properties[name] = prop;
  }
  return { type: "object", properties, required };
}

function invocationPath(name: string, schema: SchemaDef): string {
  return schema.category === "trade" ? `trade ${name}` : name;
}

function descKey(name: string, schema: SchemaDef): string {
  return schema.category === "trade" ? `trade ${name}` : name;
}

function listAll(descriptions: Record<string, string>) {
  return Object.entries(ALL_SCHEMAS).map(([name, schema]) => ({
    command: invocationPath(name, schema),
    category: schema.category,
    description: descriptions[descKey(name, schema)] ?? "",
    params: Object.keys(schema.params),
  }));
}

function detail(name: string, descriptions: Record<string, string>) {
  const schema = ALL_SCHEMAS[name];
  if (!schema) return { success: false as const, error: `Unknown command: "${name}"` };
  return {
    success: true as const,
    data: {
      command: invocationPath(name, schema),
      category: schema.category,
      description: descriptions[descKey(name, schema)] ?? "",
      params: toParamsJsonSchema(schema.params),
      output: schema.output,
    },
  };
}

/** Per-command catalog accessor: the same payload `schema <cmd>` emits, unwrapped (data only).
 *  scripts/gen-agents-catalog.ts builds agents/tool-catalog.json through this so the catalog
 *  can't drift from the live schema command. Returns null for unknown commands. */
export function commandDetail(name: string, descriptions: Record<string, string>) {
  const r = detail(name, descriptions);
  return r.success ? r.data : null;
}

export function buildSchemaHandler(descriptions: Record<string, string>): CommandHandler {
  return async (args, _values, fmt) => {
    if (args.length === 0) {
      output({ success: true, data: listAll(descriptions) }, fmt);
      return;
    }
    const name = args[0] === "trade" && args[1] ? args[1] : args[0];
    output(detail(name, descriptions), fmt);
  };
}
