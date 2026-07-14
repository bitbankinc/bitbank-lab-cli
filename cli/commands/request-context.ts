import { nowIso } from "../date-utils.js";
import type { RequestContext, Result, ResultMeta, Source } from "../types.js";

/** modulePath ("./public/ticker.js") から { source, command } を取り出す。
 *  取得コンテキスト付与は public / private のみ（paper / trade 等は undefined）。 */
function classify(modulePath: string): { source: Source; command: string } | undefined {
  const segs = modulePath.replace(/\.js$/, "").split("/");
  const source = segs[segs.length - 2];
  if (source !== "public" && source !== "private") return undefined;
  return { source, command: segs[segs.length - 1] };
}

/** extract が作った params から再現に必要なキーだけを request に写す。 */
function buildRequest(command: string, params: Record<string, unknown>): RequestContext {
  const req: RequestContext = { command };
  if (typeof params.pair === "string") req.pair = params.pair;
  if (typeof params.type === "string") req.type = params.type;
  if (typeof params.date === "string") req.date = params.date;
  if (typeof params.from === "string") req.from = params.from;
  if (typeof params.to === "string") req.to = params.to;
  if (typeof params.limit === "number") req.limit = params.limit;
  return req;
}

/** 取得コンテキスト（request / timezone / source / fetchedAt / returnedRows）を meta に付与。
 *  既存 meta（candles の gaps 等）は壊さず context で上書きマージする。
 *  失敗結果と public/private 以外（paper 等）は素通し。
 *  command には router が解決した CLI コマンド名を渡す。ファイル名由来の cls.command は
 *  未指定時（テスト等の直接呼び出し）のフォールバック。ファイル名とコマンド名は
 *  trade-history（dispatcher が trade-history-all.ts に同居）や tickers-jpy
 *  （tickers.ts の別関数）でズレるため、ラベルの単一ソースにしない。 */
export function withRequestContext<T>(
  result: Result<T>,
  modulePath: string,
  params: Record<string, unknown>,
  command?: string,
): Result<T> {
  if (!result.success) return result;
  const cls = classify(modulePath);
  if (!cls) return result;
  const meta: ResultMeta = {
    ...result.meta,
    request: buildRequest(command ?? cls.command, params),
    timezone: "UTC",
    source: cls.source,
    fetchedAt: nowIso(),
    ...(Array.isArray(result.data) ? { returnedRows: result.data.length } : {}),
  };
  return { ...result, meta };
}
