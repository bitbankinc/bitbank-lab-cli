# bitbank API フォーマットリファレンス

## ペア名規則

- 形式: `{asset}_{currency}`（例: `btc_jpy`, `eth_jpy`, `xrp_jpy`）
- **小文字のみ**。大文字は API エラーになる
- 主要ペア: `btc_jpy`, `eth_jpy`, `xrp_jpy`, `ltc_jpy`, `mona_jpy`, `bcc_jpy`, `xlm_jpy`, `bat_jpy`, `omg_jpy`, `matic_jpy`, `dot_jpy`, `doge_jpy`, `sol_jpy`, `avax_jpy`, `flr_jpy`, `sand_jpy`, `axs_jpy`, `mkr_jpy`, `ape_jpy`, `gala_jpy`, `chz_jpy`, `astr_jpy`, `ada_jpy`, `link_jpy`, `dal_jpy`, `atom_jpy`

## `uuid` フィールド（出金・入金など）

bitbank 公開 API ドキュメント（`rest-api.md` 等）上の整理:

- **型:** `string`。パターンや正規表現の明記はない。
- **記述例:** `withdrawal account's uuid`、`uuid for each deposit`、`originator uuid` など。
- **出金 API の表記例:** `POST /user/request_withdrawal` の Parameters に `uuid | string | YES | withdrawal account's uuid` とある（`rest-api.md`）。
- **プレースホルダ:** `xxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` のようにハイフン区切りで示されることが多い。先頭セグメントが 7 文字に見える表記は、ドキュメント上の placeholder の揺れであり、実 UUID は **8-4-4-4-12 の hex（RFC 4122 標準、全体 36 文字）** と読むのが自然。

**CLI 側（`cli/validators.ts` の `UuidSchema`）:** RFC 4122 形式（`8-4-4-4-12` の hex）に **厳格マッチ**。ドキュメントの「string のみ」とは形式上ずれるが、**公式例はすべて当該形式を意図しており、齟齬は実質ない**と判断してよい。

**運用上の前提:** ユーザーが UUID を手組みする想定ではなく、`withdrawal-accounts` 等で取得した値を `trade withdraw --uuid=...` にそのまま渡す **ラウンドトリップ** が前提。サーバが上記形式を返す限り、CLI の strict 検証による **false-reject は構造的に起きにくい**。bitbank 側が形式を変更した場合は `validators.ts` を見直す。

## candles コマンド

### 時間軸（`--type`）

`1min`, `5min`, `15min`, `30min`, `1hour`, `4hour`, `8hour`, `12hour`, `1day`, `1week`, `1month`

### 日付形式（`--date`）

| 時間軸 | 日付形式 | 例 |
|---|---|---|
| `1month` | `YYYY` | `2024` |
| それ以外 | `YYYYMMDD` | `20240101` |
| 未指定 | 当日データ | — |

### レスポンス形式

```json
{
  "success": 1,
  "data": {
    "candlestick": [{
      "type": "1day",
      "ohlcv": [
        ["open", "high", "low", "close", "volume", timestamp],
        ...
      ]
    }]
  }
}
```

**注意:**
- `open`, `high`, `low`, `close`, `volume` は**文字列**で返る → `parseFloat()` が必要
- `timestamp` はミリ秒 UNIX タイムスタンプ（数値）
- 配列は**古い順**（先頭が最も古いデータ）

## レスポンス共通

- `success: 1` で成功、`success: 0` でエラー
- 価格・数量は**すべて文字列**で返る（数値変換が必要）
- エラー時: `{ "success": 0, "data": { "code": 10000 } }`

## エラーコード

エラーコードの一覧は公式の [bitbank-api-docs/errors.md](https://github.com/bitbankinc/bitbank-api-docs/blob/master/errors.md) を参照（CLI 側のマッピングは `cli/error-codes.ts`）。

## レート制限

- **QUERY（読み取り）:** 10 calls/sec
- **UPDATE（書き込み）:** 6 calls/sec
- 超過すると `60001` エラー。1秒待ってリトライすればよい
