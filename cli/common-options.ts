export const COMMON_OPTIONS = {
  profile: { type: "string" as const },
  format: { type: "string" as const, default: "json" },
  help: { type: "boolean" as const, default: false },
  version: { type: "boolean" as const, short: "v", default: false },
  machine: { type: "boolean" as const, default: false },
  raw: { type: "boolean" as const, default: false },
  "log-file": { type: "string" as const },
  "no-log": { type: "boolean" as const, default: false },
};
