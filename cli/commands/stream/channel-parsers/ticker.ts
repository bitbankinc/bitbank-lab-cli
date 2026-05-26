import { TickerSchema } from "../../shared-schemas.js";

// WS ticker_<pair> は REST の /ticker と同じフィールドを返す前提（sell/buy/high/low/open/last/vol/timestamp）。
// 既存の REST TickerSchema を流用しつつ、bitbank が将来フィールドを追加しても
// 落ちないように passthrough で未知キーを温存する。
export const TickerStreamSchema = TickerSchema.passthrough();
