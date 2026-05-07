---
name: recipe-pre-trade-check
description: |
  「買う前に最低限これだけは見る」を一気通貫で実行する recipe。
  portfolio / volatility-profile / data-verification / indicator-analysis を
  順に呼び、最後に総合判断（GO / WAIT / NO-GO）を提示する。
  代表トリガー: 「pre-trade check して」「買う前にざっと見て」
  「ETH エントリーしていい？」「今このペアに入って大丈夫？」
  注意: 個別 skill の発話（RSI 見て / ボラ見て）には反応せず、全体を
  束ねたい場面でのみ起動。最終判断は人間が下す。
compatibility: |
  Requires bitbank CLI. Node.js 20+.
metadata:
  author: bitbank-aiforge
  version: "1.0"
  recipe: true
  requires:
    skills:
      - portfolio
      - volatility-profile
      - data-verification
      - indicator-analysis
---

# Pre-Trade Check Recipe

新規エントリー前のチェックリスト。`docs/skill-workflow.md` の
「1. 現状把握 → 2. 環境分析 → 3. 個別銘柄チェック」を 1 つのフローに束ねる。

## いつ使うか

- 「買う前にざっと確認したい」とユーザーが言ったとき
- ペアと方向（買い / 売り）が決まっていて、最終確認が欲しい段階
- 個別 skill を順に呼ぶより、サマリーで全体像を見たいとき

代表トリガー以外にも以下のような発話で起動する:

- 「BTC 買いたいけど、買う前に何見ればいい？」
- 曖昧形: 「BTC 買おうか迷ってる」「エントリー前にチェックして」

## 実行フロー

対象ペアを `<pair>`（例: `btc_jpy`）として、以下を順に実行する。
各ステップは対応する skill の指示に従う。**この recipe 自体は計算をしない**。

### Step 1: 現状把握 — `portfolio`

- 現在の保有資産・JPY 残高・含み損益を取得
- 取得観点:
  - 既に対象ペアを保有しているか（積み増し or 新規エントリー）
  - JPY 残高が想定エントリーサイズに対して十分か
  - ポートフォリオ全体に対する想定ポジション比率

### Step 2: 環境分析 — `volatility-profile`

- 対象ペアの最近のボラ特性を確認
- 取得観点:
  - 直近 σ が長期平均比でどの水準か（過熱気味 / 落ち着いている）
  - ファットテール倍率（±3σ の発生頻度）
  - 想定ストップ幅の目安（ATR ベース）

### Step 3: データ健全性 — `data-verification`（任意）

- 異常な相場（連休明け、メンテナンス直後等）でない場合はスキップ可
- 取得観点: 欠損足、OHLCV 整合性、重複の有無

### Step 4: 指標の現在値 — `indicator-analysis`

- デフォルト分析セット（SMA / RSI / MACD / BB / ATR / ROC）を計算
- 取得観点:
  - トレンド方向（SMA の位置関係）
  - RSI 水準（過熱 / 中立 / 売られすぎ）
  - MACD クロス、BB スクイーズ / エクスパンション

## 出力フォーマット

各 step のサマリー 2〜3 行ずつ＋総合判断ブロックで構成する。

```
## Pre-Trade Check: <pair>

### 1. 現状把握
- JPY 残高: ¥XXX,XXX / 既存保有: <pair> X.XX
- 想定ポジション比率: XX%

### 2. ボラ環境
- 直近 σ: 長期平均の X.X 倍（過熱 / 中立 / 沈静）
- 推奨ストップ幅（ATR x 2）: ±X.X%

### 3. データ健全性
- OK / 欠損 N 本（要確認）

### 4. 指標
- トレンド: 上昇 / レンジ / 下降
- RSI(14): XX.X（過熱 / 中立 / 売られすぎ）
- MACD: 直近クロス（強気 / 弱気 / なし）
- BB: スクイーズ / エクスパンション

### 総合判断: GO / WAIT / NO-GO
- 主因: <2〜3 行で根拠>
```

### 判断ルール（目安）

| 判断 | 条件の例 |
|------|----------|
| GO | トレンド方向と一致、RSI が極端でない、ボラ通常範囲、データ健全 |
| WAIT | RSI 過熱 / 売られすぎ、BB 拡大中（エントリーの位置取りが悪い） |
| NO-GO | データ欠損あり、ボラ過熱でストップ幅が許容超、JPY 残高不足 |

## Gotchas

- **この recipe は判断の補助。最終判断は人間が下す**。GO が出ても約定するのはユーザーの責任
- **各 step を「すべてフル実行」しない**。すでに直近で取得済みのデータがあれば再利用する。冗長なら省略する
- **ペアが指定されていない場合は確認する**。`btc_jpy` を勝手に仮定しない
- **データ取得期間は step ごとに最適なものを選ぶ**。volatility-profile は長期、indicator-analysis は SMA(200) が必要なので 300 本以上、portfolio は現時点
- **総合判断は機械的に出さない**。各 step の数値を踏まえて、矛盾があれば「判断保留」として根拠を示す
