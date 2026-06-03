// 実 bitbank API `GET /user/withdrawal_account`（rest-api.md "Fetch withdrawal
// account"）の代表レスポンス（`data.accounts` の 1 要素）。
//
// なぜ共有フィクスチャか:
//   margin バグ（PR #280 / #281）と同型 — インライン即席モックは実 API 形状を
//   検証しないトートロジーになる。実 API docs 由来のシェイプを 1 箇所に固定し、
//   withdrawal-accounts テストがここを import する。
//
// 形状の根拠: rest-api.md（突合表 #14 / 監査 ISSUE-F）。従来未露出だった
//   network を含める（jpy アカウントでは省略され得るため実装側は optional）。
//
// 注: x18（フィクスチャ ↔ テストの basename 一致）に合わせ、テスト
//   withdrawal-accounts.test.ts と同じ複数形ファイル名にしている。

export const withdrawalAccountsFixture = {
  accounts: [
    {
      uuid: "11111111-2222-3333-4444-555555555555",
      label: "main wallet",
      address: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
      network: "btc",
    },
  ],
};
