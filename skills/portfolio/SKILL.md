---
name: portfolio
description: |
  bitbank の保有資産と価格データから、ポートフォリオの現況
  （資産構成・JPY 建て評価額・含み損益）を把握する。
  代表トリガー: 「ポートフォリオの状況を見せて」「今いくら持ってる？」
  「含み益ある？」「最近の損益は？」
  注意: 任意ペアの相関分析は correlation-analysis、単一銘柄のリスク
  特性は volatility-profile が担当。本 skill は保有資産の評価に特化。
compatibility: |
  Requires bitbank CLI. Node.js 20+.
  Private API commands require API key/secret in .env file.
metadata:
  author: bitbank-aiforge
  version: "2.0"
---

# ポートフォリオ Skill

## いつ使うか

代表トリガー以外にも以下のような発話で起動する:

- 「資産推移を見たい」「保有資産の比率を確認して」
- 「資産減ってない？」「JPYに換算するといくら？」
- 保有資産・残高・損益についての質問全般

## 前提: Private API の認証設定

Private API コマンド（`assets`）を使うには API キー / シークレットを設定する。
詳細は `_shared/references/cli-conventions.md` の「認証」を参照。

### 推奨: profile（profiles.json）

```bash
bitbank profile add main          # 一度だけ登録（secret は対話 hidden 入力）
bitbank assets --format=json      # default profile が使われる
bitbank --profile=sub assets      # 別アカウントへ切替
```

### 後方互換: env vars

```bash
set -a; source .env; set +a
bitbank assets --format=json
```

**API キー未設定の場合:** ユーザーに `bitbank profile add <name>` を案内し、Public API（ticker, candles）だけで可能な分析を行う。

## 分析フロー

### Step 1: 保有資産の取得

```bash
bitbank assets --format=json   # profile 利用時はそのまま実行
# legacy: set -a; source .env; set +a; bitbank assets --format=json
```

### Step 2: 現在価格の取得

全 JPY ペアの ticker を一括取得:

```bash
bitbank tickers-jpy --format=json
```

### Step 3: 月次ローソク足の取得

保有銘柄ごとに月次ローソク足を取得する。年指定で1年分まとめて取れる:

```bash
bitbank candles btc_jpy --type=1month --date=2025 --format=json
bitbank candles btc_jpy --type=1month --date=2026 --format=json
```

複数年分が必要なら年ごとに並列取得する。

### Step 4: 計算・出力

取得データからモデルが以下を計算する。

## 出力項目

### 1. 現在の資産構成

保有資産・評価額・比率を一覧する。

```
=== 資産構成 ===

総評価額: 2,500,000 JPY

資産  | 保有量   | 評価額      | 比率
JPY  | 500,000 | 500,000    | 20.0%
BTC  | 0.15    | 1,387,500  | 55.5%
ETH  | 2.0     | 612,500    | 24.5%
```

- 評価額 = 保有量 × ticker の `last` 価格（JPY は 1）
- 比率 = 各資産の評価額 / 総評価額

### 2. JPY建て資産推移（月次・年次）

月次ローソク足の `close` と保有量から、各月末時点の評価額を算出する。
**保有量は現在値で固定**する（過去の保有量変動は追わない）。

```
=== 資産推移（月次） ===

月        | BTC評価額    | ETH評価額   | 合計         | 前月比
2025/01  | 1,200,000  | 540,000   | 2,240,000   | -
2025/02  | 1,350,000  | 570,000   | 2,420,000   | +8.0%
2025/03  | 1,387,500  | 612,500   | 2,500,000   | +3.3%
```

年次は各年12月の close（または最新月）で同様に算出する。

## 自己チェック（Validation Loop）

計算結果を出力する前に、以下の整合性を検証する。金額の誤りはユーザーの投資判断に直接影響するため、検証なしでの出力は避ける。

1. **各資産の評価額の合計 = 総評価額 か？** 不一致なら計算漏れ
2. **比率の合計が 100% になるか？** 丸め誤差（±0.1%）は許容するが、大きくずれていたら計算ミス
3. **JPY の評価額 = 保有量そのものか？** JPY に ticker 価格を掛けていたら誤り
4. **評価額が現実的な範囲か？** BTC 0.01 枚で数十億円など、桁が明らかにおかしければ数値変換ミスの可能性

不整合があれば原因を特定し、修正してから出力する。

## Gotchas

- **金額は文字列で返る。** 数値変換を忘れると文字列連結になり、評価額が完全に壊れる。`assets` の各フィールド、ticker の価格はすべて文字列
- **locked_amount に注意。** オーダー中の資産は `locked_amount` に入る。表示には `onhand_amount`（総量）を使う。`free_amount` だけ見ると注文中の資産が消える
- **JPY は ticker がない。** JPY の「価格」は常に 1。ticker で取得しようとするとエラーになる
- **月次ローソク足の `--date` は年（YYYY）。** `--date=2025` で2025年の全月データが取れる。YYYYMMDD で指定すると空データが返る
- **API エラー時は `_shared/references/bitbank-api-formats.md` を参照**
- **20001 エラー（認証失敗）** → `.env` の設定を確認するようユーザーに案内
