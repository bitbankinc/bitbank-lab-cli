// 実 bitbank API `GET /user/deposit_originators`（rest-api.md "Fetch deposit
// originators"）の代表レスポンス（`data.originators` の要素）。
//
// なぜ共有フィクスチャか:
//   本監査（docs/dev/audit-private-trade-schema-divergence.md）で、実装側が
//   架空フィールド `address` / `asset` / `network` を必須にしていたが、実 API は
//   `deposit_type` / `originator_status` / `originator_*`（氏名・住所・会社情報）/
//   `originator_substantial_controllers[]` という全く別構造を返すことが判明した
//   （margin バグ PR #280 / #281 と同型）。テストがインラインで実装と同じ架空
//   フィールドのモックを書くと、実 API 形状を一切検証しないトートロジーに陥る。
//   実 API docs 由来のシェイプを 1 箇所に固定し、当該テストがここを import する
//   ことで「モックは実 API 準拠」を担保する。
//
// 形状の根拠: rest-api.md の Response format JSON 例。氏名・住所・会社情報は
//   未登録時に null で返るため、代表ケースとして null を含めて再現する。
//   substantial controllers の prefecture も null あり。

export const depositOriginatorsFixture = {
  originators: [
    {
      uuid: "11111111-2222-3333-4444-555555555555",
      label: "main",
      deposit_type: "self",
      deposit_purpose: null,
      originator_status: "approved",
      originator_type: "individual",
      originator_last_name: null,
      originator_first_name: null,
      originator_country: "JP",
      originator_prefecture: "Tokyo",
      originator_city: "Chiyoda",
      originator_address: "1-1-1",
      originator_building: null,
      originator_company_name: "Example Co",
      originator_company_type: "kk",
      originator_company_type_position: "after",
      originator_substantial_controllers: [
        {
          uuid: "99999999-8888-7777-6666-555555555555",
          name: "Taro Yamada",
          country: "JP",
          prefecture: null,
        },
      ],
    },
  ],
};
