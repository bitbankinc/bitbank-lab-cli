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

### レスポンス形式（bitbank raw — `--machine` 出力ではない）

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

> これは bitbank API の **raw** 形式。CLI の `--machine` 出力では `data` がこの
> nested 構造ではなく平坦な `Candle[]`（各行 `{open, high, low, close, vol, timestamp}`、
> CLI が数値正規化済み、`type` 時間軸ラベルは落ちる）になる。詳細は下記
> 「CLI machine output envelope」節。

## depth コマンド（板情報）

`bitbank <pair> depth` は板（order book）のスナップショットを返す。raw は 10 フィールドで、
価格・数量・`sequenceId` は **すべて文字列**で来る（CLI は `numStr` で number に正規化。
下記「CLI 出力での数値正規化」節）。`DepthSchema`（`cli/commands/public/depth.ts`）は
この 10 フィールドを**全て必須**で宣言する（実 API が常時返すため）。

| フィールド | 型（CLI 正規化後） | 意味 |
|---|---|---|
| `asks` | `[price, amount][]` | 売り指値の板。**価格昇順**（最安の売り板が先頭） |
| `bids` | `[price, amount][]` | 買い指値の板。**価格降順**（最高の買い板が先頭） |
| `asks_over` | number | asks の最高値より上にある売り注文の数量 |
| `asks_under` | number | asks の最安値より下にある売り注文の数量。通常（`NORMAL`）モードでは `0` |
| `bids_over` | number | bids の最高値より上にある買い注文の数量。通常（`NORMAL`）モードでは `0` |
| `bids_under` | number | bids の最安値より下にある買い注文の数量 |
| `ask_market` | number | 未約定の成行売り注文量。通常（`NORMAL`）モードでは `0` |
| `bid_market` | number | 未約定の成行買い注文量。通常（`NORMAL`）モードでは `0` |
| `timestamp` | number | 板の発行時刻（ミリ秒 UNIX） |
| `sequenceId` | number | 板のシーケンス番号。単調増加だが連番とは限らない |

**注意:**
- `*_over` / `*_under` は板に並ぶ価格帯の外側（`over`=上端より上、`under`=下端より下）に
  ある注文数量。公式 depth docs によると通常（`NORMAL`）モードでは `asks_under` /
  `bids_over` / `ask_market` / `bid_market` は `"0"` になりやすい。
- raw では数量系も `sequenceId` も文字列（例 `"0"`、`sequenceId` は `"987654321"` のような
  数字列）で、null は来ない。CLI が `numStr` で number 化するため、出力では number として読める。
- `sequenceId` は板の新旧判定や WS `depth_diff_<pair>` との差分同期に使う整合キー。
- 配列順序（`asks` 昇順 / `bids` 降順）は下記「配列順序」表とも一致。

## レスポンス共通

- `success: 1` で成功、`success: 0` でエラー
- 価格・数量は API 側では**すべて文字列**で返る（数値変換が必要）
- エラー時: `{ "success": 0, "data": { "code": 10000 } }`

## 配列順序（エンドポイント別）

各エンドポイントが返す配列の並び順（ライブ確認済み）:

| エンドポイント | 並び順 |
|---|---|
| `candles` | **昇順（古い順）**。先頭が最古・末尾が最新。CLI が結合時に timestamp 昇順へ正規化する（`cli/commands/public/candles-merge.ts`）ため、`--machine` の平坦 `data` 配列も昇順が保証される |
| `transactions` | **降順（新しい順）**。先頭が最新の約定 |
| `depth` | `asks` は**価格昇順**（最安の売り板が先頭）、`bids` は**価格降順**（最高の買い板が先頭） |

## CLI machine output envelope（`--machine`）

skill から one-shot コマンドを呼ぶときは `--format=json --machine` を併用する
（規約は `cli-conventions.md`）。`--machine` で吐かれるのは bitbank API の
レスポンス本体（`data`）を **CLI 側の Result envelope で包んだ構造**。多くの
エンドポイントは `data` をほぼそのまま（数値正規化のみ）通すが、**candles は
例外**で、CLI が上記 raw の `candlestick[].ohlcv` を平坦な `Candle[]` に整形して
返す（API が返す `type` 時間軸ラベルは落ちる）。形は以下（candles の例）:

成功時:

```json
{
  "success": true,
  "data": [
    { "open": 100, "high": 110, "low": 90, "close": 105, "vol": 50, "timestamp": 1000 },
    { "open": 105, "high": 115, "low": 95, "close": 110, "vol": 60, "timestamp": 2000 }
  ],
  "meta": {
    "request": { "command": "candles", "pair": "btc_jpy", "type": "1day" },
    "timezone": "UTC",
    "source": "public",
    "fetchedAt": "2026-05-29T00:00:00.000Z",
    "returnedRows": 2,
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
- 内側の `data` は bitbank API のレスポンス本体に CLI が数値正規化を施したもの。
  **ただし candles は例外**で、CLI が nested `candlestick[].ohlcv` を平坦な
  `Candle[]`（各行 `{open, high, low, close, vol, timestamp}`）に整形して返す（API が
  返す `type` 時間軸ラベルは落ちる）。数値正規化済みのため文字列 → 数値変換は不要（後述）
- `meta` は CLI が付与する補助情報。candles なら `lastIsIncomplete` / `gaps` /
  `dedupedCount` / `truncated` が入りうる。加えて public / private の取得系は取得
  コンテキストを付ける: `request`（`command` と該当時の `pair` / `type` / `date` /
  `from` / `to` / `limit`）、`timezone`（`"UTC"`）、`source`（`"public"` / `"private"`）、
  `fetchedAt`（ISO 8601 / UTC）、`returnedRows`（配列結果の件数）。読み方は
  `cli-conventions.md`「`--machine` envelope の読み方」を参照
- `partial: true` は一部 fetch が失敗した結果での部分データ。完全性が必要な
  分析では再取得を提案

`--format=json` 単独（`--machine` なし）でも **同じ envelope を pretty で返す**（`meta`
込み）。`--machine` はその 1 行 compact 版で、`--raw` のときだけ `data` のみになる。
skill 経路では出力の揺れを抑えるため compact な `--machine` を使う。

### CLI 出力での数値正規化（PR #6 以降）

CLI は `cli/schema-helpers.ts` の `numStr` / `nullableNumStr` を使って
**API レスポンスの数値フィールドを number に正規化してから返す**。
JSON 出力で `"price": "5000000"` のような文字列はもう出ない（`"price": 5000000`
になる）。Skill 側で `Number(...)` / `parseFloat(...)` を挟む必要はない。
null は null のまま保持される（`nullableNumStr`）。空文字や `NaN` / `Infinity`
が来た場合はパースエラーとして弾かれる。

#### 精度・表現の限界

`number` は JS の float64（IEEE 754 倍精度）。`Number(<文字列>)` で変換するため
**値そのものは通常保持される**が、**表現・scale・極端な桁**では次の喪失が確実に起きる:

- **末尾ゼロ（scale 情報）の喪失:** `"0.0030"` → `0.003`、`"0.10000000"` → `0.1`、
  `"7500000.0000"` → `7500000`。bitbank は scale を示すため末尾ゼロ付きの文字列を返す
  ことがある（ライブの transactions / depth に `"0.0030"` が実在）が、number 化で桁数
  情報は落ちる。
- **極小値の指数表記化:** `"0.00000001"` → `1e-8`。絶対値が `1e-6` 未満の値は JSON 出力
  でも `1e-8` のような指数表記になる（値は等価だが見た目が変わる）。
- **有効桁・極大整数での精度落ち:** 有効桁が概ね 15〜17 桁を超える小数、または絶対値が
  `2^53`（= `9007199254740992`）以上の整数は float64 で正確に表せず**精度が落ちる**
  （例: `"9007199254740993"` → `9007199254740992`）。

**厳密な小数桁 / scale が要る用途**（注文数量の桁固定表示・端数処理・桁数まで含めた
照合）では、number をそのまま信用せず、**必要なら raw（API の元文字列）を別途確認する**か、
**丸め前提で扱う**こと。

> **指標計算は float64 で問題ない:** RSI / SMA / 標準偏差などの統計・テクニカル指標は
> float64 の精度で十分で、上記の scale 喪失が分析結果に実害を与えることはない。注意が要る
> のは「桁数・末尾ゼロまで含めて元の文字列を再現したい」表示・照合系の用途に限られる。

**ID 系は別扱い（精度落ちを黙って通さない）:** `transaction_id` / `order_id` など ID
フィールドは `cli/schema-helpers.ts` の `safeId` で**安全整数（< `2^53`）に制限**され、
超過は loud に reject される。bitbank は ID を数値 JSON で返すため、`JSON.parse` 段階で
桁落ちした個体を検知できる。将来 number と raw 文字列を二重持ちする方針（D4 (ii)）に
移行する余地は残すが、現状は number 維持＋本節の明記で運用する。

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
