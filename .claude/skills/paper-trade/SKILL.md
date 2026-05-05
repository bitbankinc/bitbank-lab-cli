---
name: paper-trade
description: |
  ペーパートレード（仮想資金）で売買を練習・検証する。
  bitbank の live ticker / 1m candles を取得して、成行は last 価格で即時
  fill し、指値（GTC）は openOrders に積んで前回 tick 以降の 1m 足で
  fill 解決する。実 API は public のみ叩き、private/trade エンドポイントには
  一切触れない。
  「BTC を仮想で 0.01 買って」「指値で BTC を 1000 万円で買い注文」
  「ペーパー口座の残高見て」「ペーパーの未約定注文見せて」
  「練習用に 100万円で始めたい」「仮想で sell シミュレーションして」
  「paper trade-history 見せて」「仮想口座リセットして」
  「ペーパーの指値キャンセルして」「指値の fill 確認して」
  のような発話で起動する。
  実発注（`bitbank trade ...`）とは別物で、状態は CLI 側のローカルファイル
  （`~/.bitbank/paper-state.json`）に保存される。
compatibility: |
  Requires bitbank CLI (npx tsx cli/index.ts). Node.js 20+.
  Public API のみ使用するため `.env` は不要。
metadata:
  author: bitbank-aiforge
  version: "1.0"
---

# ペーパートレード Skill

実勢価格を引きながら、仮想資金でだけ売買をシミュレートする。
本体は `bitbank paper <cmd>` サブコマンド群。Skill はモデルが
自然言語をこのコマンドに変換するための指示書であり、計算ロジックは
持たない。

## 前提

- `~/.bitbank/paper-state.json` に状態（残高・履歴）が保存される。
  XDG が設定されていれば `$XDG_DATA_HOME/bitbank/paper-state.json` が優先
- 実発注（`bitbank trade ...`）とは完全に独立。paper はライブ価格と
  1m candles を読むだけで、private/trade エンドポイントは絶対に叩かない
- 成行（`market`）は last 価格で即時 fill。指値（`limit`、GTC のみ）は
  `openOrders` に積み、`paper tick` または **lazy tick**（`paper assets` /
  `paper trade-history` / `paper active-orders` / `paper create-order` を
  呼ぶたびに裏で 1m 足を取りに行って未解決の fill を解消）で約定判定を行う。
  ストップ・OCO・部分約定は未対応

## 実行フロー

### Step 1: 初期化済みかを確認

ユーザーが残高や履歴を聞いてきた場合は、まず以下を試す:

```bash
npx tsx cli/index.ts paper assets --format=json
```

`success: false` で `not initialized` が返ったら、初期 JPY をユーザーに
確認したうえで `paper init` を案内する。デフォルト額を勝手に決めない。

### Step 2: 仮想口座を初期化

```bash
npx tsx cli/index.ts paper init --jpy=1000000 --format=json
```

既存 state があると Err になる。上書きしたい場合は `--force` を付ける。

### Step 3: 仮想注文を発注

成行は last 価格で即時 fill:

```bash
npx tsx cli/index.ts paper create-order \
  --pair=btc_jpy --side=buy --type=market --amount=0.01 --format=json
```

指値（GTC）は `openOrders` に積まれ、`price * amount + fee` 相当が JPY
側でロックされる:

```bash
npx tsx cli/index.ts paper create-order \
  --pair=btc_jpy --side=buy --type=limit --price=10000000 --amount=0.001 --format=json
```

- 成行は live の `bitbank ticker <pair>` 相当の last 価格で即時 fill
- 指値の fill 判定は前回 tick 以降の 1m 足を全走査して
  `buy: candle.low <= price` / `sell: candle.high >= price` で全量約定。
  `paper assets` / `paper trade-history` / `paper active-orders` /
  `paper create-order` を呼ぶと **裏で lazy tick** が走るので、
  通常は明示的な `paper tick` を打たなくても約定が反映される
- bitbank 公称テイカー手数料（0.12%）が JPY 建てで差し引かれる
- 残高不足（`available` ベース）は `success: false` で
  `error.message` に "insufficient ..." が入る

### Step 4: 未約定 / 残高 / 履歴の確認

```bash
npx tsx cli/index.ts paper active-orders --format=json
npx tsx cli/index.ts paper assets --format=json
npx tsx cli/index.ts paper trade-history --format=json
# 明示的に fill 解決を走らせたいとき:
npx tsx cli/index.ts paper tick --format=json
```

`paper assets` は各通貨ごとに `total` / `locked` / `available` を返す。
指値を出している間は `locked` が増え、`available = total - locked` で
発注可能額を判断する。

### Step 5: 指値のキャンセル

```bash
npx tsx cli/index.ts paper cancel-order --id=<id> --format=json
```

`active-orders` が返す `id` を渡す。キャンセル後はロックが解除され、
`available` が即座に回復する。

### Step 6: リセット（必要な場合のみ）

```bash
npx tsx cli/index.ts paper reset --confirm --format=json
```

`--confirm` なしでは Err。実発注の `withdraw` と同じ思想で誤爆を防ぐ。

## 出力フォーマット

CLI を呼ぶときは必ず `--format=json` を付ける（共通規約。
`_shared/references/cli-conventions.md` 参照）。`table` / `csv` は
人間向けなのでモデルがパースしない。

## Gotchas

- **実 API は叩かない。** paper サブコマンドは public の ticker と
  candles しか触らない。「実発注して」と頼まれた場合は
  `bitbank trade create-order ...` 側に誘導する。paper では `--execute`
  は存在しない（必要ない）
- **指値は GTC のみ。** ストップ・OCO・部分約定・有効期限は未対応。
  fill 価格は指値ぴったり（スリッページなし）
- **lastTickAt > 24h は警告 + 24h に制限。** 久しぶりに `paper tick` を
  呼ぶと stderr に `Warning: gap > 24h ...` が出て、対象期間が直近 24h
  に丸められる。これはデフォルト挙動なので無視してよい
- **残高不足は throw ではなく Err。** `success: false` の `error.message`
  をそのまま見せる。リトライしない。判定は `available = total - locked`
- **手数料は近似。** MVP は固定テイカーレート（0.0012）。約定ロジックは
  last 即 fill のためスリッページは入っていない。
  実勢との差分はユーザーに明示する
- **パスは `~/.bitbank/paper-state.json`。** 削除したい場合は
  `paper reset --confirm` を使う（手で消さなくてよい）
- **paper の trade-history と private の trade-history は別物。**
  前者は仮想履歴、後者は実約定履歴。ユーザー発話から取り違えない
