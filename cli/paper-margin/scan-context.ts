// scan.ts / scan-step.ts が共有する文脈と、足の不利な極値での口座評価（ADR-010 決定 4）。
// 窓の中で約定した現物の JPY は、book.jpy（現在の残高）には入っているが、約定より前の時刻の評価には入れない
// （売りの代金で、売る前の強制決済の判定をすり抜けないように。spot-sale.ts の spotEventsSince）。
import type { Candle } from "../commands/public/candles-fetch.js";
import type { Result } from "../types.js";
import { evaluateAccount, type MarginAccount } from "./account.js";
import type { MarginRules } from "./assumptions.js";
import type { MarginFillEvent } from "./fills.js";
import type { InterestCharge } from "./interest.js";
import { type LosscutClose, type PriceRange, worstPrices } from "./losscut.js";
import type { MarginPairParams } from "./params.js";
import type { PriceTrack } from "./scan-prices.js";
import type { MarginBook, MarginCall, MarginOrder } from "./state.js";

export type ScanEvent =
  | ({ kind: "fill" } & MarginFillEvent)
  | { kind: "margin-call"; call: MarginCall }
  | { kind: "margin-call-resolved"; at: string }
  | {
      kind: "losscut";
      at: string;
      reason: "below-losscut" | "margin-call-expired";
      closes: LosscutClose[];
      canceled: MarginOrder[];
    };

export type ScanInput = {
  book: MarginBook;
  candlesByPair: ReadonlyMap<string, readonly Candle[]>;
  params: ReadonlyMap<string, MarginPairParams>;
  rules: MarginRules;
  /** 前回 tick の時刻。JST 15 時・利息はこの時刻より後から数える */
  fromMs: number;
  toMs: number;
  /** 足を拾い始める時刻（既定は fromMs）。足の区切りに揃えて渡すと、fromMs をまたぐ足
   *  （前回 tick の時点では未確定だった足、4hour 足など）も見落とさない */
  candleFromMs?: number;
  /** 足の区切り（既定 1 分）。足の途中の時刻は、その足の安値・高値で評価する（scan-prices.ts） */
  periodMs?: number;
  /** 窓の中で約定した現物の JPY の増減（book.jpy に反映済み）。atMs より前の時刻の評価からは除く */
  spotJpy?: readonly { atMs: number; delta: number }[];
  /** 窓の中で JPY 建ての現物の指値の売りが約定した時刻。追証の解消の行為として、その時刻に判定する */
  spotSaleTimes?: readonly number[];
};

/** 走査中に積み上げる結果（events / interest）と、入力・価格への参照 */
export type ScanContext = {
  input: ScanInput;
  track: PriceTrack;
  events: ScanEvent[];
  interest: InterestCharge[];
};

export function rangesAt(ctx: ScanContext, book: MarginBook, t: number): Map<string, PriceRange> {
  return new Map(book.positions.map((p) => [p.pair, ctx.track.rangeAt(p.pair, t)] as const));
}

/** 足の不利な極値（losscut.ts の worstPrices）で評価した口座 */
export function accountAt(ctx: ScanContext, book: MarginBook, t: number): Result<MarginAccount> {
  const prices = worstPrices(book.positions, rangesAt(ctx, book, t));
  if (!prices.success) return prices;
  return evaluateAccount({
    jpy: jpyAt(ctx, book, t),
    positions: book.positions,
    openOrders: book.orders,
    riskRatio: (pair) => ctx.input.params.get(pair)?.riskRatio,
    price: (pair) => prices.data.get(pair),
  });
}

/** 時刻 t の差入保証金。t より後に約定した現物の JPY の増減を、現在の残高から除く */
function jpyAt(ctx: ScanContext, book: MarginBook, t: number): number {
  const later = (ctx.input.spotJpy ?? []).filter((e) => e.atMs > t);
  return later.reduce((jpy, e) => jpy - e.delta, book.jpy);
}
