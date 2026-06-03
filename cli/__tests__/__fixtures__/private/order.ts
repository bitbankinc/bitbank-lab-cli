// 実 bitbank API の注文レスポンス（GET /user/spot/order・active_orders・orders_info、
// および trade create-order が共有する OrderSchema）の代表シェイプ。
//
// なぜ共有フィクスチャか:
//   margin バグ（PR #280 / #281）と同型の穴 — テストがインライン即席モックで
//   実装と同じ形だけ検証すると、実 API 形状を一切確認しないトートロジーに陥る。
//   実 API docs 由来のシェイプを 1 箇所に固定し、order / active-orders / orders-info の
//   各テストがここを import することで「モックは実 API 準拠」を担保する。
//
// 形状の根拠: rest-api.md "Fetch order information"（突合表 #2〜#5 / 監査 ISSUE-F）。
//   従来未露出だった position_side（margin のみ）/ user_cancelable（常時）/
//   triggered_at・trigger_price（stop 系のみ）を含める。数値は API が返す
//   「文字列」のまま置く（CLI 側 numStr / nullableNumStr が number へ変換する）。

// spot の指値注文（margin / stop フィールドは持たない代表ケース）。
export const orderFixture = {
  order_id: 12345,
  pair: "btc_jpy",
  side: "buy",
  type: "limit",
  start_amount: "0.001",
  remaining_amount: "0.001",
  executed_amount: "0",
  price: "15000000",
  post_only: true,
  average_price: "0",
  ordered_at: 1234567890123,
  expire_at: null,
  status: "UNFILLED",
  user_cancelable: true,
};

// margin の逆指値注文。position_side（long/short）と triggered_at / trigger_price を含む。
export const stopOrderFixture = {
  order_id: 12346,
  pair: "btc_jpy",
  side: "sell",
  type: "stop",
  start_amount: "0.001",
  remaining_amount: "0.001",
  executed_amount: "0",
  price: null,
  average_price: "0",
  ordered_at: 1234567890123,
  expire_at: null,
  status: "UNFILLED",
  user_cancelable: false,
  position_side: "long",
  triggered_at: 1234567899999,
  trigger_price: "14000000",
};
