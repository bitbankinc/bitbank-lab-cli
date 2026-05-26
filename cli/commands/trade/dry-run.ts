import { CONFIRM_PHRASES, type TradeCommandKey } from "./confirm-guard.js";

export type DryRunInfo = {
  endpoint: string;
  body: Record<string, unknown>;
  executeHint: string;
  confirmPhrase?: string;
};

const SENSITIVE_FLAGS = new Set(["token", "otp_token"]);

export function printDryRun(info: DryRunInfo): void {
  const lines = [
    "🔍 DRY RUN（実際のAPIは叩きません）",
    "",
    "リクエスト内容:",
    `  エンドポイント: POST ${info.endpoint}`,
    "  ボディ:",
  ];
  for (const [k, v] of Object.entries(info.body)) {
    const display = SENSITIVE_FLAGS.has(k) ? '"***"' : JSON.stringify(v);
    lines.push(`    ${k}: ${display}`);
  }
  lines.push("");
  const phrase = info.confirmPhrase;
  lines.push(
    phrase
      ? `実行するには --execute と --confirm=${phrase} を付けてください:`
      : "実行するには --execute を付けてください:",
  );
  lines.push(`  ${info.executeHint}`);
  process.stdout.write(`${lines.join("\n")}\n`);
}

export type TradeDryRunInput = {
  command: TradeCommandKey;
  endpoint: string;
  body: Record<string, unknown>;
  args: Record<string, unknown>;
};

export function buildExecuteHint(input: TradeDryRunInput): string {
  const flags: string[] = [];
  for (const [k, v] of Object.entries(input.args)) {
    if (v === undefined || v === null || v === false) continue;
    const flag = k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
    if (SENSITIVE_FLAGS.has(k) || SENSITIVE_FLAGS.has(flag)) {
      flags.push(`--${flag}=***`);
      continue;
    }
    flags.push(typeof v === "boolean" ? `--${flag}` : `--${flag}=${v}`);
  }
  flags.push("--execute");
  flags.push(`--confirm=${CONFIRM_PHRASES[input.command]}`);
  return `npx bitbank trade ${input.command} ${flags.join(" ")}`;
}

export function dryRunResult(input: TradeDryRunInput): {
  success: true;
  data: { dryRun: true };
} {
  printDryRun({
    endpoint: input.endpoint,
    body: input.body,
    executeHint: buildExecuteHint(input),
    confirmPhrase: CONFIRM_PHRASES[input.command],
  });
  return { success: true, data: { dryRun: true } };
}
