---
name: paper-trade
description: |
  仮想資金でペーパートレード（売買練習）を行う。実 API は public ticker
  と 1m candles のみで、private/trade エンドポイントには触れない。
  代表トリガー: 「BTC を仮想で買って」「ペーパー口座の残高見て」
  「ペーパーの損益見せて」「仮想口座リセットして」
  注意: 実発注（`bitbank trade ...`）は対象外。状態は
  `~/.bitbank/paper-state.json` にローカル保存される。
compatibility: |
  Requires the bitbank CLI on PATH (install separately: npm i -g bitbank-lab-cli).
  Plugin install alone does NOT bundle the CLI or its dependencies. Node.js 22+.
  Public API のみ使用するため `.env` は不要。
metadata:
  author: bitbank-aiforge
  version: "1.0"
  requires:
    bins:
      - bitbank
---

# ペーパートレード Skill

実勢価格を引きながら、仮想資金でだけ売買をシミュレートする。
本体は `bitbank paper <cmd>` サブコマンド群。Skill はモデルが
自然言語をこのコマンドに変換するための指示書であり、計算ロジックは
持たない。

## いつ使うか

代表トリガー以外にも以下のような発話で起動する:

- 発注系: 「BTC を仮想で 0.01 買って」「指値で BTC を 1000 万円で買い注文」
  「練習用に 100万円で始めたい」「仮想で sell シミュレーションして」
- 確認系: 「ペーパーの未約定注文見せて」「paper trade-history 見せて」
  「指値の fill 確認して」
- P&L 系: 「仮想口座いくら勝ってる？」「含み益どれくらい？」
  「BTC のペーパー P&L は？」
- キャンセル: 「ペーパーの指値キャンセルして」

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
bitbank paper assets --format=json --machine
```

`success: false` で `not initialized` が返ったら、初期 JPY をユーザーに
確認したうえで `paper init` を案内する。デフォルト額を勝手に決めない。

### Step 2: 仮想口座を初期化

```bash
bitbank paper init --jpy=1000000 --format=json --machine
```

既存 state があると Err になる。上書きしたい場合は `--force` を付ける。

### Step 3: 仮想注文を発注

成行は last 価格で即時 fill:

```bash
bitbank paper create-order \
  --pair=btc_jpy --side=buy --type=market --amount=0.01 --format=json --machine
```

指値（GTC）は `openOrders` に積まれ、`price * amount + fee` 相当が JPY
側でロックされる:

```bash
bitbank paper create-order \
  --pair=btc_jpy --side=buy --type=limit --price=10000000 --amount=0.001 --format=json --machine
```

- 成行は live の `bitbank ticker <pair>` 相当の last 価格で即時 fill
- 指値の fill 判定は前回 tick 以降の 1m 足を全走査して
  `buy: candle.low <= price` / `sell: candle.high >= price` で全量約定。
  `paper assets` / `paper trade-history` / `paper active-orders` /
  `paper create-order` を呼ぶと **裏で lazy tick** が走るので、
  通常は明示的な `paper tick` を打たなくても約定が反映される
- 成行（taker）の手数料は対象ペアのライブ taker レート（/spot/pairs 由来・
  campaign 追従）が quote 建てで差し引かれる
- 指値の約定は必ず maker。手数料は対象ペアのライブ maker レート（/spot/pairs
  由来・campaign 追従）を quote 建てで適用する。bitbank の maker は負
  （リベート）になり得るため、約定で残高が増えることがある（買いは cost が
  減り、売りは proceeds が増える）
- 残高不足（`available` ベース）は `success: false` で
  `error.message` に "insufficient ..." が入る

### Step 4: 未約定 / 残高 / 履歴の確認

```bash
bitbank paper active-orders --format=json --machine
bitbank paper assets --format=json --machine
bitbank paper trade-history --format=json --machine
# 明示的に fill 解決を走らせたいとき:
bitbank paper tick --format=json --machine
```

`paper assets` は各通貨ごとに `total` / `locked` / `available` を返す。
指値を出している間は `locked` が増え、`available = total - locked` で
発注可能額を判断する。

### Step 5: 損益（P&L）を見る

```bash
# 全ペア + 合計
bitbank paper pnl --format=json --machine
# 単一ペアに絞る
bitbank paper pnl --pair=btc_jpy --format=json --machine
```

- `paper trade-history` から加重平均でコスト基底を再構築し、`realizedPnl`
  / `unrealizedPnl` / `totalPnl` を JPY 建てで返す。state スキーマには
  キャッシュを持たず、毎回履歴から計算する
- 手数料は買い側で `avgCost` に上乗せ、売り側は `realizedPnl` から減算
- `unrealizedPnl` は現在 ticker（last）で評価。ペアごとに並列 fetch する
- JPY 建て（`*_jpy`）以外のペアは stderr に warning を出して計算から除外
- `position == 0 && realizedPnl == 0` のペアは出力されない。`realizedPnl`
  が非ゼロなら position 0 でも残る

### Step 6: 指値のキャンセル

```bash
bitbank paper cancel-order --id=<id> --format=json --machine
```

`active-orders` が返す `id` を渡す。キャンセル後はロックが解除され、
`available` が即座に回復する。

### Step 7: リセット（必要な場合のみ）

```bash
bitbank paper reset --confirm --format=json --machine
```

`--confirm` なしでは Err。実発注の `create-order` と同じく誤爆を防ぐ思想。

## 出力フォーマット

CLI を呼ぶときは必ず `--format=json --machine` を付ける（共通規約。
`_shared/references/cli-conventions.md` 参照）。`table` / `csv` は
人間向けなのでモデルがパースしない。

## 可視化（オプション）

トリガー規律・実行環境の解決・出力先・スタイル・安全規律は
`_shared/references/visualization-guide.md` に従う。**デフォルトは off**
（ユーザーが明示的に求めたとき、または提案に同意したときだけ描く）。
チャートはテキスト出力の後に描き、その置き換えにはしない。

本 skill の標準チャート:

| チャート ID | 内容 | 主な構成要素 |
|---|---|---|
| `paper-trade.pnl-by-pair` | ペア別 P&L | `paper pnl` の realizedPnl / unrealizedPnl / totalPnl をペアごとのグループ棒 + 合計。y=JPY。0 の水平線を引く |

チャート固有の注意:

- `PAPER (virtual funds)` を図中に必ず明記する（実口座の損益と誤認させない。
  private の trade-history との取り違え防止は本文 Gotchas と同じ思想）
- fill 前提（成行 = last 価格、指値 = 指値ぴったり、スリッページなし、
  手数料はライブ maker/taker）をフッターに書く
- 値は `paper pnl` の返り値をそのまま使う。図のための再計算をしない

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
- **手数料はライブ maker/taker。** 成行は taker、指値は maker レートを
  `/spot/pairs` から取得して quote 建てで適用する（campaign 追従。maker は
  リベートで負になり得る）。ペアが取得できないときのみ既定 0.0012 に
  フォールバック。約定は last / 指値ぴったりの fill でスリッページは
  入っていない点はユーザーに明示する
- **手数料レートは 24h キャッシュ。** `/spot/pairs` は 24h キャッシュされる
  ため、campaign 開始直後はレート反映が最大 24h 遅れることがある。
  `paper create-order --refresh-pairs` で即時に取り直せる
- **パスは `~/.bitbank/paper-state.json`。** 削除したい場合は
  `paper reset --confirm` を使う（手で消さなくてよい）
- **paper の trade-history と private の trade-history は別物。**
  前者は仮想履歴、後者は実約定履歴。ユーザー発話から取り違えない
