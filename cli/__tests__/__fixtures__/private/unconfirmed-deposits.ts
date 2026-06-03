// 実 bitbank API `GET /user/unconfirmed_deposits`（rest-api.md "Fetch unconfirmed
// deposits"）の代表レスポンス（`data.deposits` の 1 要素）。
//
// なぜ共有フィクスチャか:
//   本監査（docs/dev/audit-private-trade-schema-divergence.md）で、実装側が
//   架空フィールド `found_at` を必須にしていたが実 API は `created_at` を返し、
//   かつ `network` を持つことが判明した（margin バグ PR #280 / #281 と同型）。
//   テストがインラインで実装と同じ架空フィールドのモックを書くと、実 API 形状を
//   一切検証しないトートロジーに陥る。実 API docs 由来のシェイプを 1 箇所に
//   固定し、当該テストがここを import することで「モックは実 API 準拠」を担保する。
//
// 形状の根拠: rest-api.md の Response format JSON 例
//   { "uuid", "asset", "amount", "network", "txid", "created_at" }。
//   数値は API が返す「文字列」のまま置く（`amount` は numStr が number へ変換する
//   ため変換前の生形状を再現）。`created_at` は number、`found_at` は持たない。

export const unconfirmedDepositsFixture = {
  deposits: [
    {
      uuid: "11111111-2222-3333-4444-555555555555",
      asset: "btc",
      amount: "0.1",
      network: "btc",
      txid: "tx123",
      created_at: 1234567890123,
    },
  ],
};
