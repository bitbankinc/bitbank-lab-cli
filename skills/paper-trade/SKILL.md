---
name: paper-trade
description: |
  仮想資金でペーパートレード（売買練習）を行う。現物に加えて信用（新規建て・返済、
  レバレッジ 2 倍）の練習もできる。実 API は public の ticker・candlestick・pairs のみで、
  private/trade エンドポイントには触れない。
  代表トリガー: 「BTC を仮想で買って」「ペーパー口座の残高見て」
  「ペーパーの損益見せて」「仮想口座リセットして」「仮想でショートして」
  「ペーパーで信用買いして」「ペーパーの保証金率見せて」
  注意: 実発注（`bitbank trade ...`）は対象外。状態は
  `~/.bitbank/paper-state.json` にローカル保存される。
compatibility: |
  Requires the bitbank CLI on PATH (install separately: npm i -g bitbank-lab-cli).
  Plugin install alone does NOT bundle the CLI or its dependencies. Node.js 22+.
  Public API のみ使用するため `.env` は不要。
metadata:
  author: bitbankinc
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
  XDG が設定されていれば `$XDG_DATA_HOME/bitbank/paper-state.json` が優先、
  `BITBANK_PAPER_STATE_PATH` が設定されていればそれが最優先（複数口座の切替用）
- **参照先は `meta.statePath` で確認する。** 全 paper コマンドが `--machine` の envelope に
  実際に読み書きした state file を載せる。ユーザーが複数の仮想口座を使い分けている
  文脈では、残高や損益を報告する前にこの値が意図した口座かを確かめる（環境変数の
  付け忘れは既定パスへ静かにフォールバックし、エラーにならない）
- 実発注（`bitbank trade ...`）とは完全に独立。paper は public の ticker・
  candlestick・pairs を読むだけで、private/trade エンドポイントは絶対に叩かない
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

## 信用取引（ペーパー）

仮想資金で信用の新規建て・返済を練習する。保証金率・追証・強制決済・利息は、bitbank の
公表ルール（信用取引ルール）どおりに paper が再現する。実 API は現物の paper と同じく public のみ。

### 前提

- 信用対応ペアは `/spot/pairs` にリスク想定比率が載っているペア（2026-11 時点で btc / eth /
  xrp / sol / doge）。それ以外のペアは PARAM で拒否される
- リスク想定比率は pairs の個人口座の値を使う（2026-11 時点で 50%＝レバレッジ 2 倍。週次で変わり得るので、
  実際の値は `margin-status` の `assumptions.riskRatios`）。保証金は仮想口座の **JPY 残高だけ**
  （現物の暗号資産は保証金に入れない。本番は掛目 50% で入る）
- 新規建て / 返済は `--side` と `--position-side` の組合せで決まる:

  | 操作 | `--side` | `--position-side` |
  |---|---|---|
  | ロング新規建て | buy | long |
  | ロング返済 | sell | long |
  | ショート新規建て | sell | short |
  | ショート返済 | buy | short |

- 新規建てと返済の取り違えを防ぐため、**`--intent=open|close` を必ず付ける**。
  side × position-side と食い違えば PARAM で止まり、意図した操作に必要な `--side` が案内される

### Step M1: 口座の状態を見る

```bash
bitbank paper margin-status --format=json --machine
```

- 本番の `margin-status` と同じ名前の欄: `total_margin_balance_percentage`（保証金率 %）、
  `total_position_maintenance_margin`（維持必要保証金）、`available_balances`（新規建てできる
  注文金額の見積り）、`status`（NORMAL / CALL / DEBT）など
- `thresholds`: paper の判定しきい値（追証・強制決済が起きる保証金率 %）
- `assumptions`: 本番と一致させられない値（評価価格 = ticker の last、保証金 = JPY のみ、
  公表ルールの定数と出典、使ったリスク想定比率。pairs から読めなくなったペアは `source: "last-known"`）
- `available_balances` は、追証・不足金の間と新規建て停止中の向きは 0（新規建てを受け付けないため）
- `stale: true` は、裏の tick が足を取れず信用を今の時刻まで処理できていない印。
  数値が古い可能性を伝え、少し置いて再実行する

### Step M2: 新規建て・返済

```bash
# ロング新規建て（成行は last で即時約定）
bitbank paper create-margin-order \
  --pair=btc_jpy --side=buy --position-side=long --intent=open --type=market --amount=0.01 --format=json --machine
# ショート新規建て（指値。約定は lazy tick）
bitbank paper create-margin-order \
  --pair=eth_jpy --side=sell --position-side=short --intent=open --type=limit --price=600000 --amount=0.1 --format=json --machine
# ロング返済
bitbank paper create-margin-order \
  --pair=btc_jpy --side=sell --position-side=long --intent=close --type=market --amount=0.01 --format=json --machine
```

- 結果の `operation.label`（例: `ロング返済（sell × long）`）をユーザーに見せ、意図どおりか確かめる
- 新規建ての手数料は JPY から引かず建玉に積み、返済時に「按分した新規建て分 + 返済分」を
  まとめて徴収する（本番と同じ）。返済の `profitLoss` は手数料・利息を引いた後の値で、
  JPY 残高にはこの値だけが入る
- 受け付けない注文と、本番で対応するエラー（`success: false` の `error.message` をそのまま見せる。リトライしない）:

  | 条件 | 本番 | 終了コード |
  |---|---|---|
  | `--position-side` が無い・未対応の種別・`--intent` の食い違い | — | 4 |
  | 信用非対応ペア | 40167 | 4 |
  | 新規建て停止中（返済はできる） | 50083 / 50081 | 1 |
  | 新規建て可能額の超過 | 50061 | 1 |
  | 返済可能数量（建玉 − 未約定の返済注文）の超過 | 50062 | 1 |
  | 追証中・不足金がある間の新規建て（返済はできる） | — | 1 |

### Step M3: 建玉・注文の確認と取り消し

```bash
bitbank paper margin-positions --format=json --machine
bitbank paper active-orders --format=json --machine
bitbank paper cancel-order --id=<id> --format=json --machine
```

- `margin-positions` は建玉ごとの `locked_amount`（未約定の返済注文が予約している数量）・
  未精算の手数料と利息・`unrealized_profit_loss`（paper だけの欄。last で評価）と、
  追証・不足金の `notice` を返す
- `active-orders` / `cancel-order` は現物と信用の両方を扱う。信用の注文には `positionSide` が付く

### Step M4: 損益・履歴

- `paper pnl` の `margin` 欄に、ペア × ロング / ショートごとの実現・未実現損益が入る
  （未実現は値幅から未精算の手数料・利息を引いた値）。`perPair` / `total` は現物だけ
- `paper trade-history` には信用の約定も時刻順に混ざる（`positionSide` / `feeCharged` /
  `profitLoss` / `interest` 付き。強制決済の決済は `type: "losscut"`）

### paper が再現するルール

- 利息（買建て）・暗号資産貸付料（売建て）: **JST 0 時**をまたぐたびに、建玉の建値の合計 × pairs の日率
  （`margin_long_interest` / `margin_short_interest`。2026-11 時点で 0.04%/日）
- 以下の 50% / 25% は比率 50% のときの例。説明するときは `margin-status` の `thresholds`（paper の判定しきい値）と
  `assumptions`（使った比率）の値を使う。判定は口座全体なので、比率の違うペアを複数建てているときのしきい値は、
  各ペアの比率を建値の合計で加重平均した値（`thresholds` はこの値。強制決済はそれに掛け目 0.5 を掛けた値）
- 追証: **毎日 JST 15 時**に「維持必要保証金 > 受入保証金合計額」なら発生（保証金率がリスク想定比率未満。比率 50% なら 50% 未満）。
  期限は 24 時間。返済か現物の売却の直後に条件が解けていれば解消する（価格の回復だけでは解消しない）。
  現物の売却は JPY 建ての売り（`paper create-order --side=sell`）で、追証の発生後のものだけ。成行の売りは結果の
  `marginCallResolved` で解消したかが分かる。その場で判定できなかったとき（信用の状態が古い・現在値を取れない）や
  指値の売りは、lazy tick が売った時刻の口座で判定する。ただし、現物の足だけ取れずに信用の走査が先へ進んだ後で
  約定が確定した指値の売りは、次に信用を走査できた tick の窓の頭で判定する（売った時刻より遅れる）。この場合も、
  追証の発生より前に約定した売りは数えない
  期限までに解消しなければ強制決済
- 強制決済: **随時**、「維持必要保証金 × 0.5 > 受入保証金合計額」で発動（保証金率が比率 × 0.5 未満。比率 50% なら 25% 未満）。
  全建玉を決済し、信用の注文を取り消す
- 決済で JPY 残高が負になったら不足金（`status: "DEBT"`）。新規建ては出せないが、残っている建玉の返済はできる。
  paper に入金は無いので、建玉が無くなった後は `paper reset --confirm` で作り直す
- 信用の走査は現物とは別の時刻（`margin-status` の `last_scan_at`）で進む。`stale: true` の間（足が取れなかった等）は
  信用の注文を受け付けないので、少し待って再実行する
- pairs から信用パラメータを読めなくなったペア（取扱終了など）は、最後に読めた値で評価・返済を続ける（`warnings` に出る）。
  そのペアの新規建てはできない

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
  に丸められる。これはデフォルト挙動なので無視してよい（現物の指値の話。
  信用は打ち切らず、24h を超える区間を 4 時間足で判定して `approximate` の警告を出す）
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
- **パスは `~/.bitbank/paper-state.json`（`BITBANK_PAPER_STATE_PATH` で上書き可）。**
  削除したい場合は `paper reset --confirm` を使う（手で消さなくてよい）
- **paper の trade-history と private の trade-history は別物。**
  前者は仮想履歴、後者は実約定履歴。ユーザー発話から取り違えない
- **paper の保証金率は本番の目安ではない。** 評価価格（last）と保証金の範囲（JPY のみ）が
  本番と違い得る。信用の数値を伝えるときは `assumptions` を添え、本番の口座の状態は
  private の `margin-status`（API キーが要る）で確認するよう案内する
- **ずれは強制決済が早く起きる側。** 追証・強制決済の判定と決済は 1 分足の不利な極値
  （ロングは安値、ショートは高値）で行う。本番より早く・不利に強制決済されることがある
- **実口座の信用の発注はこの CLI では未対応**（計画中）。「本番で信用買いして」と頼まれたら、
  paper 以外では出せない旨を伝える
- **`paper create-order` は現物専用。** `--position-side` を付けると PARAM で止まり、
  `paper create-margin-order` を案内される
- **`paper assets` に信用の必要保証金は出ない。** `available` は現物の注文が使える額。
  信用の必要保証金と新規建てできる額は `paper margin-status` で見る
