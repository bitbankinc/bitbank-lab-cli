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

**運用上の前提:** ユーザーが UUID を手組みする想定ではなく、`withdrawal-accounts` / `withdrawal-history` などのレスポンスとして返ってきた値を CLI 側で読み取る **ラウンドトリップ** が前提。サーバが上記形式を返す限り、CLI の strict 検証による **false-reject は構造的に起きにくい**。bitbank 側が形式を変更した場合は `validators.ts` を見直す。

## candles コマンド

### 時間軸（`--type`）

`1min`, `5min`, `15min`, `30min`, `1hour`, `4hour`, `8hour`, `12hour`, `1day`, `1week`, `1month`

### 日付形式（`--date`）

| 時間軸 | 日付形式 | 例 |
|---|---|---|
| `4hour`, `8hour`, `12hour`, `1day`, `1week`, `1month` | `YYYY` | `--type=1day --date=2024` |
| `1min`, `5min`, `15min`, `30min`, `1hour` | `YYYYMMDD` | `--type=1hour --date=20240101` |
| 未指定 | 当日データ | — |

実装上のソース: `cli/date-utils.ts` の `YEARLY_TYPES`。`YYYY` 系の時間軸に
`YYYYMMDD` を渡す（または逆）と CLI が reject するので、Skill から組み立てる
際は時間軸と日付形式の対応を必ず確認する。

### 日付キーのタイムゾーン（UTC 基準）

**重要:** bitbank の candlestick endpoint で渡す `YYYYMMDD` / `YYYY` は **UTC 基準**。
公式 docs は timezone を明記していないが、実 API で確認済み:

- `GET /btc_jpy/candlestick/1hour/20260101` の先頭 timestamp = `1767225600000`
  = `2026-01-01T00:00:00Z`（UTC 00:00）
- `1day/2026` の 1 本目も UTC 2026-01-01 00:00 起点

ローソク足の `timestamp`（ミリ秒 UNIX）もそのまま UTC で、`1day` 足は UTC 月初/年初に揃う。
**JST は表示・説明用にのみ使う**こと（例: 「UTC 14:00 / JST 23:00」のような併記）。
API キーや境界判定には JST を持ち込まない。

実装は `cli/date-utils.ts` の `ymdUtc` / `yearUtc` / `todayDate` / `nextBoundaryMs`
を経由する。`cache.ts` の `isCompletePeriod` も UTC 基準で「今日」と比較する。

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
- 価格・数量は API 側では**すべて文字列**で返る（数値変換が必要）
- エラー時: `{ "success": 0, "data": { "code": 10000 } }`

## CLI machine output envelope（`--machine`）

skill から one-shot コマンドを呼ぶときは `--format=json --machine` を併用する
（規約は `cli-conventions.md`）。`--machine` で吐かれるのは bitbank API の
raw レスポンス（上記の `success: 1 / data: ...`）を **CLI 側の Result envelope
で包んだ二重構造** で、形は以下:

成功時:

```json
{
  "success": true,
  "data": { "candlestick": [{ "type": "1day", "ohlcv": [...] }] },
  "meta": {
    "lastIsIncomplete": true,
    "gaps": [{ "from": 1735603200000, "to": 1735776000000, "missing": 2 }],
    "dedupedCount": 0
  },
  "partial": false
}
```

失敗時:

```json
{ "success": false, "error": "60001: 残高不足", "exitCode": 1 }
```

- 外側の `success` / `error` / `exitCode` は **CLI 側の Result**。
  `success === true` でなければ `data` を読まない
- 内側の `data` は bitbank API のレスポンス本体（`data.candlestick[0].ohlcv` 等）。
  CLI が数値正規化済みのため文字列 → 数値変換は不要（後述）
- `meta` は CLI が付与する補助情報。candles なら `lastIsIncomplete` / `gaps` /
  `dedupedCount` / `truncated` が入りうる。読み方は `cli-conventions.md`
  「`--machine` envelope の読み方」を参照
- `partial: true` は一部 fetch が失敗した結果での部分データ。完全性が必要な
  分析では再取得を提案

`--format=json` 単独（`--machine` なし）では `data` 配下しか出ない。skill
経路では meta が読めなくなるため、必ず `--machine` を併用する。

### CLI 出力での数値正規化（PR #6 以降）

CLI は `cli/schema-helpers.ts` の `numStr` / `nullableNumStr` を使って
**API レスポンスの数値フィールドを number に正規化してから返す**。
JSON 出力で `"price": "5000000"` のような文字列はもう出ない（`"price": 5000000`
になる）。Skill 側で `Number(...)` / `parseFloat(...)` を挟む必要はない。
null は null のまま保持される（`nullableNumStr`）。空文字や `NaN` / `Infinity`
が来た場合はパースエラーとして弾かれる。

#### WebSocket ストリームでの数値正規化

`bitbank stream <pair>`（public）も REST と同じ正規化を通る。`cli/commands/stream/channel-parsers/`
配下の channel schema で `ticker_<pair>` / `transactions_<pair>` / `depth_diff_<pair>` /
`depth_whole_<pair>` / `circuit_break_info_<pair>` の数値フィールドを number に変換する。
`bitbank watch ticker <pair>` も同様に正規化済み（`cli/watch/format.ts` の `TickerDataSchema`）。

未登録 channel や schema が合わない payload は **raw のまま流す + stderr に 1 回 warning** という
fallback 設計。Skill 側は stdout の JSONL を素直に `JSON.parse` してよく、数値は number 型として扱える。

なお、`bitbank stream --private` は PubNub 経由で多種類の event_type が流れる構造上、
**現時点では raw のまま**になっている。private イベントを Skill から消費する場合は
`Number(...)` / `parseFloat(...)` を明示的に挟む必要がある。

## エラーコード

エラーコードの一覧は公式の [bitbank-api-docs/errors.md](https://github.com/bitbankinc/bitbank-api-docs/blob/master/errors.md) を参照（CLI 側のマッピングは `cli/error-codes.ts`）。

## レート制限

- **QUERY（読み取り）:** 10 calls/sec
- **UPDATE（書き込み）:** 6 calls/sec
- 超過すると `60001` エラー。1秒待ってリトライすればよい
