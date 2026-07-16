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
  Requires the bitbank CLI on PATH (install separately: npm i -g bitbank-lab-cli).
  Plugin install alone does NOT bundle the CLI or its dependencies. Node.js 22+.
  Private API commands require API key/secret in .env file.
metadata:
  author: bitbank-aiforge
  version: "2.0"
  requires:
    bins:
      - bitbank
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
bitbank profile add main                    # 一度だけ登録（secret は対話 hidden 入力）
bitbank assets --format=json --machine      # default profile が使われる
bitbank --profile=sub assets --format=json --machine   # 別アカウントへ切替
```

### 後方互換: env vars

```bash
set -a; source .env; set +a
bitbank assets --format=json --machine
```

**API キー未設定の場合:** ユーザーに `bitbank profile add <name>` を案内し、Public API（ticker, candles）だけで可能な分析を行う。

## 分析フロー

### Step 1: 保有資産の取得

```bash
bitbank assets --format=json --machine   # profile 利用時はそのまま実行
# legacy: set -a; source .env; set +a; bitbank assets --format=json --machine
```

### Step 2: 現在価格の取得

全 JPY ペアの ticker を一括取得:

```bash
bitbank tickers-jpy --format=json --machine
```

### Step 3: 月次ローソク足の取得

保有銘柄ごとに月次ローソク足を取得する。年指定で1年分まとめて取れる:

```bash
bitbank candles btc_jpy --type=1month --date=2025 --format=json --machine
bitbank candles btc_jpy --type=1month --date=2026 --format=json --machine
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

## 可視化（オプション）

トリガー規律・実行環境の解決・出力先・スタイル・安全規律は
`_shared/references/visualization-guide.md` に従う。**デフォルトは off**
（ユーザーが明示的に求めたとき、または提案に同意したときだけ描く）。
チャートはテキスト出力（資産構成・資産推移のテーブル）の後に描き、
その置き換えにはしない。

本 skill の標準チャート:

| チャート ID | 内容 | 主な構成要素 |
|---|---|---|
| `portfolio.allocation` | 資産構成 | 出力項目 1 の評価額比率のドーナツ（評価額の大きい順、JPY 現金を含む、中央に総評価額）。ラベルは凡例方式が既定・小口は Others に集約（いずれも下記）。ticker 取得時刻をフッターに。詳細比較用に横棒版への切替も可 |
| `portfolio.value-history` | JPY 建て資産推移 | 出力項目 2 の月次評価額。銘柄別の積み上げ棒（または合計線 + 銘柄別線）。`holdings fixed at current amounts`（保有量は現在値固定）を図中に明記 |

チャート固有の注意:

- 図中の金額・比率は本文のテーブルと一致していること
  （Validation Loop と同じ整合性検証を図にも適用する）
- **`allocation` のラベル規律（凡例方式が既定）**:
  - 凡例に `BTC 79.8% (47,997 JPY)` 形式で銘柄・比率・金額を列挙する
  - スライス内の % 注記は大きいスライス（目安 10% 以上）のみ。
    小スライスは凡例で読む
  - **外周ラベル + 引き出し線は使わない**（小スライスが隣接すると
    ラベルが干渉するため。凡例は matplotlib が自動配置するので
    重なりが構造的に起きない）
- **`allocation` の小口集約ルール**（bitbank は 40 銘柄超に対応しており、
  多銘柄・ダスト保有で円が細切れになるのを防ぐ）:
  - 比率 **3% 未満**の銘柄は「Others」に集約する（閾値はユーザー指定で変更可）
  - 閾値以上でもスライスは**最大 6 枚 + Others** まで（超過分は小さい順に Others へ）
  - Others の**件数・合計比率・主な内訳**を凡例か脚注に書く
    （例: `Others = XRP, DOGE 他 5 銘柄（計 4.2%）`）
  - **JPY（現金）は比率に関わらず独立スライス**にする（現金余力は
    一級の判断材料のため Others に畳まない）
  - 全銘柄の完全な内訳はテキストのテーブル側に必ず残す（チャートは
    テキストを置き換えない）。ダスト精査には横棒版（全銘柄表示）を使う
- **口座情報（評価額・保有量）を含む**ため、画像の共有には注意。ユーザーが
  共有前提と明言している場合は、絶対額を伏せた比率のみの表示を提案する
  （`visualization-guide.md` の安全規律）
- `value-history` は保有量を現在値で固定した近似であり、過去の実際の資産額
  ではない。この前提を図中の注記から省略しない

## Gotchas

- **金額は文字列で返る。** 数値変換を忘れると文字列連結になり、評価額が完全に壊れる。`assets` の各フィールド、ticker の価格はすべて文字列
- **locked_amount に注意。** オーダー中の資産は `locked_amount` に入る。表示には `onhand_amount`（総量）を使う。`free_amount` だけ見ると注文中の資産が消える
- **JPY は ticker がない。** JPY の「価格」は常に 1。ticker で取得しようとするとエラーになる
- **月次ローソク足の `--date` は年（YYYY）。** `--date=2025` で2025年の全月データが取れる。YYYYMMDD で指定すると空データが返る
- **API エラー時は `_shared/references/bitbank-api-formats.md` を参照**
- **20001 エラー（認証失敗）** → `.env` の設定を確認するようユーザーに案内
