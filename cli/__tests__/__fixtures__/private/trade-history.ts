// 実 bitbank API `GET /user/spot/trade_history`（rest-api.md "Fetch trade history"）の
// 代表レスポンス（`data.trades` の 1 要素）。
//
// なぜ共有フィクスチャか:
//   margin バグ（PR #280 / #281）と同型 — インライン即席モックは実 API 形状を
//   検証しないトートロジーになる。実 API docs 由来のシェイプを 1 箇所に固定し、
//   trade-history / trade-history-all の各テストがここを import する。
//
// 形状の根拠: rest-api.md（突合表 #8 / 監査 ISSUE-F）。従来未露出だった
//   fee_occurred_amount_quote（spot でも常時返る）/ position_side（margin のみ）/
//   profit_loss・interest（省略あり）を含む margin 約定を代表に置く。数値は
//   API が返す「文字列」のまま（CLI 側 numStr / nullableNumStr が number へ変換）。

export const tradeHistoryFixture = {
  trades: [
    {
      trade_id: 1,
      pair: "btc_jpy",
      order_id: 100,
      side: "buy",
      type: "limit",
      amount: "0.001",
      price: "15000000",
      maker_taker: "maker",
      fee_amount_base: "0",
      fee_amount_quote: "0",
      fee_occurred_amount_quote: "0",
      executed_at: 1234567890123,
      position_side: "long",
      profit_loss: "1000",
      interest: "-5",
    },
  ],
};
