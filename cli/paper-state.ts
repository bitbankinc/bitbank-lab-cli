// 100行超: paper サブコマンド専用のローカル状態管理。
// CLI 全体は API データの取得・整形のみを責務とするが、
// paper はライブ価格 × 仮想資金のシミュレーションを行うため例外的に
// state を持つ（CLAUDE.md 参照）。スキーマ・I/O・v1→v3 マイグレーション・
// 残高ロック集計をまとめて集約。
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import { sanitizeErrorMessage } from "./error-sanitize.js";
import { DEFAULT_TAKER_FEE_RATE } from "./fees.js";
import type { Result } from "./types.js";

export const PaperHistoryEntrySchema = z.object({
  id: z.string(),
  pair: z.string(),
  side: z.enum(["buy", "sell"]),
  type: z.enum(["market", "limit"]),
  amount: z.number(),
  fillPrice: z.number(),
  feeQuote: z.number(),
  filledAt: z.string(),
});

export const OpenOrderSchema = z.object({
  id: z.string(),
  pair: z.string(),
  side: z.enum(["buy", "sell"]),
  type: z.literal("limit"),
  price: z.number(),
  amount: z.number(),
  createdAt: z.string(),
});

// v1 / v2 では fee フィールドが feeJpy だった。v3 で feeQuote にリネーム。
const PaperHistoryEntrySchemaLegacy = z.object({
  id: z.string(),
  pair: z.string(),
  side: z.enum(["buy", "sell"]),
  type: z.enum(["market", "limit"]),
  amount: z.number(),
  fillPrice: z.number(),
  feeJpy: z.number(),
  filledAt: z.string(),
});

const PaperStateSchemaV1 = z.object({
  version: z.literal(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  initialJpy: z.number(),
  balances: z.record(z.string(), z.number()),
  history: z.array(PaperHistoryEntrySchemaLegacy),
});

const PaperStateSchemaV2 = z.object({
  version: z.literal(2),
  createdAt: z.string(),
  updatedAt: z.string(),
  initialJpy: z.number(),
  balances: z.record(z.string(), z.number()),
  history: z.array(PaperHistoryEntrySchemaLegacy),
  lastTickAt: z.string(),
  openOrders: z.array(OpenOrderSchema),
});

export const PaperStateSchema = z.object({
  version: z.literal(3),
  createdAt: z.string(),
  updatedAt: z.string(),
  initialJpy: z.number(),
  balances: z.record(z.string(), z.number()),
  history: z.array(PaperHistoryEntrySchema),
  lastTickAt: z.string(),
  openOrders: z.array(OpenOrderSchema),
});

const PaperStateAnySchema = z.discriminatedUnion("version", [
  PaperStateSchemaV1,
  PaperStateSchemaV2,
  PaperStateSchema,
]);

export type PaperState = z.infer<typeof PaperStateSchema>;
export type PaperHistoryEntry = z.infer<typeof PaperHistoryEntrySchema>;
export type OpenOrder = z.infer<typeof OpenOrderSchema>;

// 手数料定数は CLI 共通の cli/fees.ts に集約。既存 import を壊さないよう re-export。
export { DEFAULT_TAKER_FEE_RATE };

export function defaultStatePath(): string {
  if (process.env.BITBANK_PAPER_STATE_PATH) return process.env.BITBANK_PAPER_STATE_PATH;
  const xdg = process.env.XDG_DATA_HOME;
  if (xdg) return join(xdg, "bitbank", "paper-state.json");
  return join(homedir(), ".bitbank", "paper-state.json");
}

export function nowIso(): string {
  return new Date(Date.now()).toISOString();
}

export function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function upgradeHistory(
  history: z.infer<typeof PaperHistoryEntrySchemaLegacy>[],
): PaperHistoryEntry[] {
  return history.map(({ feeJpy, ...rest }) => ({ ...rest, feeQuote: feeJpy }));
}

function migrateToV3(parsed: z.infer<typeof PaperStateAnySchema>): PaperState {
  if (parsed.version === 3) return parsed;
  if (parsed.version === 2) {
    return { ...parsed, version: 3, history: upgradeHistory(parsed.history) };
  }
  return {
    version: 3,
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
    initialJpy: parsed.initialJpy,
    balances: parsed.balances,
    history: upgradeHistory(parsed.history),
    lastTickAt: parsed.updatedAt,
    openOrders: [],
  };
}

export function computeLocked(
  state: PaperState,
  feeRate: number = DEFAULT_TAKER_FEE_RATE,
): Record<string, number> {
  const locked: Record<string, number> = {};
  for (const o of state.openOrders) {
    const [base, quote] = o.pair.split("_");
    if (o.side === "buy") {
      const cost = o.price * o.amount * (1 + feeRate);
      locked[quote] = (locked[quote] ?? 0) + cost;
    } else {
      locked[base] = (locked[base] ?? 0) + o.amount;
    }
  }
  return locked;
}

export function availableOf(
  state: PaperState,
  asset: string,
  feeRate: number = DEFAULT_TAKER_FEE_RATE,
): number {
  const total = state.balances[asset] ?? 0;
  const locked = computeLocked(state, feeRate)[asset] ?? 0;
  return total - locked;
}

export async function loadState(path = defaultStatePath()): Promise<Result<PaperState | null>> {
  try {
    const buf = await readFile(path, "utf-8");
    const json = JSON.parse(buf) as unknown;
    const parsed = PaperStateAnySchema.safeParse(json);
    if (!parsed.success) {
      return {
        success: false,
        error: sanitizeErrorMessage(`Invalid paper state: ${parsed.error.message}`),
      };
    }
    return { success: true, data: migrateToV3(parsed.data) };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return { success: true, data: null };
    }
    return { success: false, error: `Failed to read paper state: ${sanitizeErrorMessage(e)}` };
  }
}

// 単発上書き用の atomic write。load -> mutate -> save の一連処理で並行
// アクセスが起き得る場面では使わない（lost update の原因になる）。
// 並行を伴う変更は paper-state-mutate.ts の updateState 経由にする。
export async function saveState(
  state: PaperState,
  path = defaultStatePath(),
): Promise<Result<{ saved: true }>> {
  const data = `${JSON.stringify(state, null, 2)}\n`;
  const tmp = `${path}.${process.pid}.${Math.random().toString(36).slice(2, 10)}.tmp`;
  try {
    await mkdir(dirname(path), { recursive: true });
    const fh = await open(tmp, "w", 0o600);
    try {
      await fh.writeFile(data);
      await fh.sync();
    } finally {
      await fh.close();
    }
    await rename(tmp, path);
    return { success: true, data: { saved: true } };
  } catch (e) {
    await unlink(tmp).catch(() => {});
    return { success: false, error: `Failed to write paper state: ${sanitizeErrorMessage(e)}` };
  }
}

export async function deleteState(path = defaultStatePath()): Promise<Result<{ deleted: true }>> {
  try {
    await unlink(path);
    return { success: true, data: { deleted: true } };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return { success: true, data: { deleted: true } };
    }
    return { success: false, error: `Failed to delete paper state: ${sanitizeErrorMessage(e)}` };
  }
}
