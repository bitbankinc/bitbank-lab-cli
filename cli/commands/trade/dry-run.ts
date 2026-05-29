import type { DryRunData } from "../../types.js";
import { CONFIRM_PHRASES, type TradeCommandKey } from "./confirm-guard.js";

const SENSITIVE_FLAGS = new Set(["token", "otp_token"]);

export type TradeDryRunInput = {
  command: TradeCommandKey;
  endpoint: string;
  body: Record<string, unknown>;
  args: Record<string, unknown>;
};

export function buildExecuteHint(input: TradeDryRunInput): string {
  const flags: string[] = [];
  for (const [k, v] of Object.entries(input.args)) {
    // execute / confirm は末尾で必ず付与するので、args に紛れ込んでいても二重化させない
    if (k === "execute" || k === "confirm") continue;
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

/** body の機微フラグ（token 等）をマスクする。--machine の envelope にも載るため、
 *  描画側ではなくデータ生成時にマスクして秘匿を保証する。 */
function maskBody(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    out[k] = SENSITIVE_FLAGS.has(k) ? "***" : v;
  }
  return out;
}

/** dry-run の構造化データを返す（描画はしない）。
 *  出力層（output.ts / output-dry-run.ts）が machine=envelope / human=box に振り分ける。 */
export function dryRunResult(input: TradeDryRunInput): { success: true; data: DryRunData } {
  return {
    success: true,
    data: {
      dryRun: true,
      endpoint: input.endpoint,
      body: maskBody(input.body),
      executeHint: buildExecuteHint(input),
      confirmPhrase: CONFIRM_PHRASES[input.command],
    },
  };
}
