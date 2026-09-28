// agents/ の機械可読カタログ生成器。tool-catalog.json / error-catalog.json /
// chart-catalog.json を単一ソース（cli/commands/schema・confirm-guard・
// cli/error-codes・cli/exit-codes・skills/*/SKILL.md 可視化節）から生成する。
// 手書き禁止: cli/__tests__/chaos/conventions/x17 が「regenerate して
// committed と差分ゼロ」を検査するため、出力に時刻などの非決定要素を入れないこと。
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildChartCatalog } from "./chart-catalog.js";
import { commandDescriptions } from "../cli/commands/registry.js";
import { commandDetail } from "../cli/commands/schema/handler.js";
import { ALL_SCHEMAS } from "../cli/commands/schema/registry.js";
import { schemaKey } from "../cli/commands/schema/types.js";
import { CONFIRM_PHRASES } from "../cli/commands/trade/confirm-guard.js";
import { ERROR_CODES, apiErrorExitCode, classifyHttpError } from "../cli/error-codes.js";
import { EXIT } from "../cli/exit-codes.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA_VERSION = "1.0";
const GENERATOR = "scripts/gen-agents-catalog.ts";
const EXIT_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(EXIT).map(([name, code]) => [code, name]),
);

function cliVersion(): string {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string };
  return pkg.version;
}

export function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

// ---- tool-catalog -----------------------------------------------------------

export function buildToolCatalog() {
  const descriptions = commandDescriptions();
  // CONFIRM_PHRASES は trade の素のコマンド名がキー。ALL_SCHEMAS 側は呼び出しパスなので
  // `trade <name>` へ寄せてから照合する（paper reset / profile remove の --confirm は
  // 固定フレーズを持たない別物なので、ここには載らない = dangerous にならない）。
  const phrases: Record<string, string> = Object.fromEntries(
    Object.entries(CONFIRM_PHRASES).map(([name, phrase]) => [schemaKey(name, "trade"), phrase]),
  );
  const commands = Object.keys(ALL_SCHEMAS)
    .map((name) => {
      const d = commandDetail(name, descriptions);
      if (!d) return null;
      // dangerous の単一ソースは confirm-guard の CONFIRM_PHRASES。
      const dangerous = name in phrases;
      return {
        command: d.command,
        category: d.category,
        auth_required:
          d.category === "private" || d.category === "trade" || d.category === "tax",
        description: d.description,
        dangerous,
        ...(dangerous ? { confirm: phrases[name] } : {}),
        params: d.params,
        output: d.output,
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  return {
    schema_version: SCHEMA_VERSION,
    cli_version: cliVersion(),
    generator: GENERATOR,
    description:
      "Machine-readable command catalog for the bitbank CLI. Generated from cli/commands/schema (ALL_SCHEMAS) + trade confirm-guard (CONFIRM_PHRASES). `command` is the full invocation path: subcommand groups (trade / tax / paper / profile) are spelled `<group> <name>`, everything else is a bare name. `dangerous: true` marks fund-affecting trade commands that require --execute together with --confirm=<confirm>; paper and profile touch no real funds, so their --confirm flags (paper reset, profile remove) are plain required booleans declared in `params` and are not dangerous. A param with `positional: true` is passed as a bare argument, not a flag. Do not edit by hand — run `npx tsx scripts/gen-agents-catalog.ts`.",
    command_count: commands.length,
    dangerous_count: commands.filter((c) => c.dangerous).length,
    commands,
  };
}

// ---- error-catalog ----------------------------------------------------------

// GENERAL（exit 1）は apiErrorExitCode がサブ分類しない catch-all なので、コード単位の
// retry 指針をここで補う。ラベルは skills/_shared/references/error-catalog.md の表記と揃える。
// 信用（50058〜50084）は POST でしか出ないため post 視点で書く: 一時制限（50059 / 50060）だけ
// 時間を置けば通り得る。方向別の停止（50081〜50084）や審査未完了・可能額超過は再送しても直らない。
const GENERAL_RETRY: Record<number, { retry: string; hint: string }> = {
  10000: { retry: "no_retry", hint: "Malformed URL; fix the request." },
  50003: { retry: "retry_after_long", hint: "Trading halted (maintenance); wait 5-15 min." },
  50004: { retry: "retry_after_long", hint: "Auction (itayose) in progress; wait 5-15 min." },
  50009: { retry: "no_retry", hint: "Order not found; re-fetch active-orders before retrying." },
  50058: { retry: "no_retry", hint: "Margin trading not approved; apply/review on bitbank first." },
  50059: { retry: "retry_after_medium", hint: "Temporary restriction on new margin orders." },
  50060: { retry: "retry_after_medium", hint: "Temporary restriction on new margin orders." },
  50061: {
    retry: "no_retry",
    hint: "Exceeds open capacity; check margin-status available_balances.",
  },
  50062: {
    retry: "no_retry",
    hint: "Exceeds position (open_amount - locked_amount); check margin-positions.",
  },
  50081: { retry: "no_retry", hint: "Margin sell-to-open halted for this direction." },
  50082: { retry: "no_retry", hint: "Margin sell-to-close halted for this direction." },
  50083: { retry: "no_retry", hint: "Margin buy-to-open halted for this direction." },
  50084: { retry: "no_retry", hint: "Margin buy-to-close halted for this direction." },
  60001: { retry: "no_retry", hint: "Insufficient balance; check assets and reduce amount." },
  60019: { retry: "no_retry", hint: "TakeProfit/StopLoss side must be the close direction." },
  70001: { retry: "retry_after_short", hint: "System error; GET auto-retries, POST verify first." },
};

function buildApiCodes() {
  return Object.entries(ERROR_CODES)
    .map(([key, message]) => {
      const code = Number(key);
      const exit_code = apiErrorExitCode(code);
      const category = EXIT_NAME[exit_code];
      const sub = category === "GENERAL" ? GENERAL_RETRY[code] : undefined;
      return { code, message, category, exit_code, ...(sub ?? {}) };
    })
    .sort((a, b) => a.code - b.code);
}

function buildCategories(apiCodes: ReturnType<typeof buildApiCodes>) {
  const codesFor = (cat: string) => apiCodes.filter((c) => c.category === cat).map((c) => c.code);
  // AUTH の HTTP ステータスは classifyHttpError（private/trade 経路）から導出する。
  const authHttp = [401, 403].filter(
    (s) => EXIT_NAME[classifyHttpError(s, "", false).exitCode] === "AUTH",
  );
  return [
    {
      category: "AUTH",
      exit_code: EXIT.AUTH,
      retryable: false,
      api_codes: codesFor("AUTH"),
      http_status: authHttp,
      get: "no_retry",
      post: "no_retry",
      agent_action:
        "Credentials/signature problem; retrying won't help. Check .env / API key & permissions, then stop. A public command hitting 403 is classified GENERAL (IP/region/network), not AUTH.",
    },
    {
      category: "RATE_LIMIT",
      exit_code: EXIT.RATE_LIMIT,
      retryable: true,
      api_codes: codesFor("RATE_LIMIT"),
      http_status: [429],
      get: "retry_after_medium",
      post: "abort_and_verify",
      agent_action:
        "Back off and reduce concurrency. GET honors Retry-After in http-core; do not hammer. POST is never auto-retried — verify order state before any manual retry.",
    },
    {
      category: "PARAM",
      exit_code: EXIT.PARAM,
      retryable: false,
      api_codes: codesFor("PARAM"),
      http_status: [],
      get: "no_retry",
      post: "no_retry",
      agent_action:
        "Invalid input (missing/malformed pair, order-id, price, amount, asset). Fix the arguments; retrying unchanged fails forever.",
    },
    {
      category: "GENERAL",
      exit_code: EXIT.GENERAL,
      retryable: false,
      api_codes: codesFor("GENERAL"),
      http_status: ["5xx", "403 (public)"],
      get: "retry_after_short",
      post: "abort_and_verify",
      agent_action:
        "Catch-all: balance 60001, trading halted 50003/50004, order-not-found 50009 (order lookup is a pair × order_id composite key — 50009 also fires when the order exists but the pair is wrong, and for executed/cancelled orders older than 3 months per official docs; verify both the pair and the order's age against that retention period before concluding the order is gone), system 70001, HTTP 5xx, margin 50058-50062 / 50081-50084 / 60019 (POST only: 50059/50060 are temporary and may be retried after a wait; approval 50058, capacity 50061/50062 and per-direction halts 50081-50084 are not). apiErrorExitCode does not sub-classify these — branch on the leading code in the error string; each GENERAL api_codes entry carries a per-code `retry` label and `hint` (see skills/_shared/references/error-catalog.md). 5xx GET auto-retries up to 2x in http-core; POST never does.",
    },
    {
      category: "NETWORK",
      exit_code: EXIT.NETWORK,
      retryable: true,
      api_codes: [],
      http_status: [],
      transport: "fetch exception (timeout / ECONNRESET / DNS)",
      get: "retry_after_short",
      post: "abort_and_verify",
      agent_action:
        "Transport failure. GET auto-retries up to 2x (http-core). POST forces retryOnNetworkError:false — the request may have succeeded silently; verify with active-orders / trade-history / assets before any manual retry.",
    },
  ];
}

export function buildErrorCatalog() {
  const apiCodes = buildApiCodes();
  return {
    schema_version: SCHEMA_VERSION,
    cli_version: cliVersion(),
    generator: GENERATOR,
    description:
      "Machine-readable error catalog for the bitbank CLI. Generated from cli/error-codes.ts (ERROR_CODES / apiErrorExitCode / classifyHttpError) + cli/exit-codes.ts. Maps API error codes to categories and aggregates retry guidance per category. Companion human doc: skills/_shared/references/error-catalog.md. Do not edit by hand.",
    envelope: {
      on_failure:
        "Failed commands return { success: false, error, exitCode } — there is no error.code field.",
      error_string:
        "When an API body code is present, `error` is '<code>: <message>' (e.g. '60001: 残高不足'). Route on `exitCode` plus the leading numeric code; never parse the human-readable message text.",
      exit_code_field: "`exitCode` follows cli/exit-codes.ts (see exit_codes).",
    },
    exit_codes: { ...EXIT },
    post_retry_policy: {
      auto_retry: false,
      source: "cli/http-private-post.ts",
      rule: "trade (POST) commands force retries:0 and retryOnNetworkError:false to protect idempotency. On timeout / 5xx / network error the order or withdrawal may have succeeded silently; verify with `bitbank active-orders` / `bitbank trade-history` / `bitbank assets` before any manual retry.",
    },
    api_codes: apiCodes,
    categories: buildCategories(apiCodes),
  };
}

// ---- entrypoint -------------------------------------------------------------

export { buildChartCatalog };

function main(): void {
  const dir = join(ROOT, "agents");
  mkdirSync(dir, { recursive: true });
  const tool = buildToolCatalog();
  const error = buildErrorCatalog();
  const chart = buildChartCatalog();
  writeFileSync(join(dir, "tool-catalog.json"), serialize(tool));
  writeFileSync(join(dir, "error-catalog.json"), serialize(error));
  writeFileSync(join(dir, "chart-catalog.json"), serialize(chart));
  console.log(
    `agents/tool-catalog.json: ${tool.command_count} commands (${tool.dangerous_count} dangerous)`,
  );
  console.log(
    `agents/error-catalog.json: ${error.api_codes.length} codes, ${error.categories.length} categories`,
  );
  console.log(
    `agents/chart-catalog.json: ${chart.chart_count} charts across ${chart.skills_with_charts.length} skills`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
