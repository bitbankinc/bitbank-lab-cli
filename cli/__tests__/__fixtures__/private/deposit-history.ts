// 実 bitbank API `GET /user/deposit_history`（rest-api.md "Fetch deposit
// history"）の代表レスポンス（`data.deposits` の要素）。
//
// なぜ共有フィクスチャか:
//   本監査（docs/dev/audit-private-trade-schema-divergence.md / 突合表 #11）で、
//   実装側の DepositSchema が `confirmed_at` を非 optional（nullable のみ）にして
//   いたが、docs 本文は "confirmed_at … exists only for confirmed one" と明記して
//   おり、FOUND ステータスの入金ではキーごと欠落し得る。さらに実 API は
//   `address` / `network` を返すのに実装が露出していなかった。テストが常に
//   confirmed_at ありのインラインモックで自己完結すると、FOUND（欠落）ケースの
//   パース失敗を一切検知できないトートロジーに陥る。実 API docs 由来の 2 ケースを
//   1 箇所に固定し、当該テストがここを import することで両シェイプを担保する。
//
// 形状の根拠: rest-api.md の Response format JSON 例
//   { "uuid", "asset", "network", "amount", "txid", "status", "found_at",
//     "confirmed_at" }。数値は API が返す「文字列」のまま置く（`amount` は numStr
//   が number へ変換するため変換前の生形状を再現）。`found_at` / `confirmed_at` は
//   number。
//
// 2 ケース:
//   ① CONFIRMED/DONE: confirmed_at あり（確認済み入金）
//   ② FOUND: confirmed_at 欠落（未確認入金。docs の "exists only for confirmed
//      one" に対応する欠落シェイプを再現）
//
// 注意（要実機確認）: docs の JSON 例は confirmed_at を `0` としか示しておらず、
//   FOUND 時に「キー欠落」か「null」かは未確定。実装は両対応（nullable + optional）
//   の安全側にしてあり、本フィクスチャは「キー欠落」側を代表ケースとして再現する。
//   `network` の jpy 入金での有無も同様に実機確認が望ましい。

export const depositHistoryFixture = {
  deposits: [
    {
      // ① CONFIRMED/DONE: confirmed_at あり
      uuid: "11111111-2222-3333-4444-555555555555",
      asset: "btc",
      network: "btc",
      amount: "0.1",
      address: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
      txid: "tx123",
      status: "DONE",
      found_at: 1234567890123,
      confirmed_at: 1234567890200,
    },
    {
      // ② FOUND: confirmed_at 欠落（キーごと無い）
      uuid: "66666666-7777-8888-9999-000000000000",
      asset: "btc",
      network: "btc",
      amount: "0.2",
      address: "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2",
      txid: "tx456",
      status: "FOUND",
      found_at: 1234567891000,
    },
  ],
};
