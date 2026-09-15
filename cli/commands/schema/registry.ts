import { paperSchemas } from "./defs-paper.js";
import { privateAccountSchemas } from "./defs-private-account.js";
import { privateBalanceSchemas } from "./defs-private-balance.js";
import { privateMarginSchemas } from "./defs-private-margin.js";
import { privateTransferSchemas } from "./defs-private-transfer.js";
import { profileSchemas } from "./defs-profile.js";
import { publicBriefSchemas } from "./defs-public-brief.js";
import { publicDataSchemas } from "./defs-public-data.js";
import { publicMarketSchemas } from "./defs-public-market.js";
import { streamSchemas } from "./defs-stream.js";
import { taxSchemas } from "./defs-tax.js";
import { tradeSchemas } from "./defs-trade.js";
import { type SchemaDef, schemaKey } from "./types.js";

const DEFS: Record<string, SchemaDef>[] = [
  publicMarketSchemas,
  publicDataSchemas,
  publicBriefSchemas,
  privateAccountSchemas,
  privateBalanceSchemas,
  privateTransferSchemas,
  privateMarginSchemas,
  tradeSchemas,
  streamSchemas,
  taxSchemas,
  paperSchemas,
  profileSchemas,
];

const merged: Record<string, SchemaDef> = {};
const collisions: string[] = [];
for (const defs of DEFS) {
  for (const [name, def] of Object.entries(defs)) {
    const key = schemaKey(name, def.category);
    // スプレッド合成だと後勝ちで既存定義が型エラーも出さずに消える。先勝ち +
    // 記録に変えて、落ちた定義をテストから可視化する。
    if (key in merged) collisions.push(key);
    else merged[key] = def;
  }
}

/** コマンドカタログ。キーは呼び出しパス（`ticker` / `trade create-order` / `paper assets`）。 */
export const ALL_SCHEMAS: Record<string, SchemaDef> = merged;

/** 合成時に衝突して捨てられたキー。空でなければ定義がカタログから落ちている。
 *  cli/commands/ は例外を投げない規約（chaos x01）なので、異常を投げずに
 *  検査可能な値で表す（cli/__tests__/schema-registry.test.ts が空を検査）。 */
export const SCHEMA_KEY_COLLISIONS: readonly string[] = collisions;

/** 各 defs のキー数の合計。ALL_SCHEMAS の件数と一致するのが正常。 */
export const SCHEMA_DEF_COUNT: number = DEFS.reduce((n, d) => n + Object.keys(d).length, 0);
