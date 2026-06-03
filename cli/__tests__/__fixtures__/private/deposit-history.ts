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
// 3 ケース:
//   ① CONFIRMED/DONE（暗号資産）: confirmed_at / address / network あり
//   ② FOUND（暗号資産）: confirmed_at 欠落（docs の "exists only for confirmed
//      one" に対応する欠落シェイプを再現）
//   ③ DONE（jpy 法定通貨）: address / network 欠落・txid null。銀行振込のため
//      deposit address が存在せず、暗号資産専用フィールドが落ちる形状を再現
//
// 注意（要実機確認）: docs の JSON 例は confirmed_at を `0` としか示しておらず、
//   FOUND 時に「キー欠落」か「null」かは未確定。さらに docs は JSON 例で address を
//   落としており（フィールド説明欄には address・network とも存在する）、jpy 入金で
//   address/network が実際に欠落するかは docs に明示がない。実装は双方を optional に
//   した安全側で、本フィクスチャは「キー欠落」側を代表ケースとして再現する。
//   実機の jpy 入金レスポンスで最終確定すること。

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
    {
      // ③ DONE（jpy 法定通貨）: address / network 欠落・txid null
      uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      asset: "jpy",
      amount: "10000",
      txid: null,
      status: "DONE",
      found_at: 1234567892000,
      confirmed_at: 1234567892100,
    },
  ],
};
