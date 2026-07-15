---
name: indicator-analysis
description: |
  bitbank のローソク足データから SMA / RSI / MACD / ボリンジャーバンド等の
  テクニカル指標の現在値を計算し、トレンド判定や売買シグナルの読みに答える。
  代表トリガー: 「BTC の RSI を見て」「移動平均のクロスを確認して」
  「BTC の調子どう？」「今買い時？」「相場の雰囲気は？」
  注意: シグナルの予測力検証は signal-explorer、戦略 PnL は backtest、
  単一銘柄のリスク特性は volatility-profile が担当。
compatibility: |
  Requires the bitbank CLI on PATH (install separately: npm i -g bitbank-lab-cli).
  Plugin install alone does NOT bundle the CLI or its dependencies. Node.js 22+.
metadata:
  author: bitbank-aiforge
  version: "1.0"
  requires:
    bins:
      - bitbank
---

# テクニカル指標分析 Skill

## いつ使うか

代表トリガー以外にも以下のような発話で起動する:

- 「ボリバンのスクイーズは？」「チャートの形どうなってる？」
- 「ETH 最近どんな動き？」
- 価格やトレンドについて聞かれた曖昧な質問全般

## データ取得

ローソク足データを CLI で取得する:

```bash
bitbank candles <pair> --type=<timeframe> --format=json --machine
```

例:

```bash
# BTC/JPY の日足を取得
bitbank candles btc_jpy --type=1day --format=json --machine

# ETH/JPY の4時間足、特定日
bitbank candles eth_jpy --type=4hour --date=20250301 --format=json --machine

# データ件数を指定（デフォルト 1000 件）
bitbank candles btc_jpy --type=1hour --limit=200 --format=json --machine

# 期間指定で取得（2025 年通年など）
bitbank candles btc_jpy --type=1day --from=20250101 --to=20251231 --format=json --machine
```

`--format=json --machine` を併用する。`--machine` で
`{ success, data, meta }` envelope が出力され、`meta.lastIsIncomplete` /
`gaps` / `dedupedCount` 等が読める（規約: `_shared/references/cli-conventions.md`）。

## 取得本数の目安

**ユーザーが期間・日時を指定した場合はそれを最優先**する:

- 期間指定（「過去 1 ヶ月」「2024 年 3 月だけ」等）→ `--from=YYYYMMDD --to=YYYYMMDD`
- 単独日のみ（特定日のローソク足を見たい）→ `--date=YYYYMMDD`
- 「過去 N 本」「直近の動き」のような本数指定 → `--limit=N`

期間/日時の指示がなく `--limit` も省略すると CLI は 1000 件取得する。
1000 件は context を大きく消費するため、分析対象に応じて
「必要本数 + warmup」を目安に明示指定する:

- **デフォルト分析セット**（SMA 200 を含む）: `--limit=300`
- **短期指標のみ**（RSI / MACD / BB / ATR / ROC）: `--limit=100`
- **長期トレンド・サンプル数が必要な統計**: `--limit=1000`（= CLI default）

warmup を確保するのは、SMA(N) や ATR(N) は最初の N-1 本が定義不能で捨てるため。
迷ったら `--limit=300` で始める。

## デフォルト分析セット

ユーザーが指標を指定しない場合、以下をすべて計算する:

- **SMA**: 20, 50, 200 期間
- **RSI**: 14 期間
- **MACD**: 短期 12, 長期 26, シグナル 9
- **ボリンジャーバンド**: 20 期間, 2σ
- **ATR**: 14 期間
- **ROC**: 12 期間

ユーザーが特定の指標やパラメータを指定した場合はそちらを優先する。

## 実行手順

1. `candles` コマンドで OHLCV データを取得
2. envelope の `success` を確認後、`data` 配列を取り出す（`--machine` の `data` は平坦な配列。`data.candlestick` は存在しない）
3. 各行は `{open, high, low, close, vol, timestamp}` オブジェクト（CLI が数値正規化済み、timestamp はミリ秒 UNIX/UTC）
4. 配列は昇順（古い順）。先頭が最古、末尾が最新
5. `meta.lastIsIncomplete: true` なら **末尾足を計算から除外**するか、未確定である
   ことをサマリーに明示する（指標が未確定足を含むと当日の値が安定しない）。
   `gaps` / `truncated` がある場合も同様に注記する
6. デフォルト分析セット（または指定された指標）を計算
7. 結果をテーブル形式で表示し、サマリーを付ける

## 出力フォーマット

### テーブル形式（最新5〜10本分）

```
日付        | 終値       | SMA20      | SMA50      | RSI(14) | MACD    | Signal  | BB上限     | BB下限     | ATR(14) | ROC(12)
2024-03-01 | 9,250,000 | 9,100,000 | 8,900,000 | 62.3    | 15,200  | 12,800  | 9,400,000 | 8,800,000 | 85,000  | +2.4%
...
```

### サマリー

計算結果に基づいて以下を述べる:
- 現在のトレンド方向（SMA の位置関係から）
- RSI の水準（過熱/中立/売られすぎ）
- MACD のクロス状況
- ボリンジャーバンドの幅（スクイーズ/エクスパンション）
- ATR の現在値とその水準（過去 N 本平均との比較で「ボラ拡大中/縮小中」を一言）
- ROC の符号と大きさ（モメンタムの方向）

## 自己チェック（Validation Loop）

計算結果を出力する前に、以下の整合性を検証する。指標計算はモデルが直接行うため、計算ミスがそのまま誤った分析につながる。

1. **RSI が 0〜100 の範囲内か？** 範囲外なら計算式に誤りがある
2. **SMA が実際の価格の近傍にあるか？** 桁が大きくずれていたら数値変換ミスの可能性
3. **MACD シグナルが MACD の平滑化になっているか？** MACD より大幅に乖離していたら期間設定ミス
4. **ボリンジャーバンドの上限 > SMA > 下限 になっているか？** 逆転していたら σ 計算に誤り
5. **最新値と直近のローソク足の close が一致するか？** ずれていたらデータの取り違え
6. **ATR が非負か？** TR の最大値で算出するため負値は出ないはず
7. **ATR が価格スケールと整合するか？** ATR は価格と同じ単位。BTC/JPY なら数千〜数十万円台。桁違いなら数値変換ミスの可能性
8. **ROC が常識的な範囲か？** 1hour で ±20% 超なら確認（暗号資産の急変でも稀）

不整合があれば原因を特定し、修正してから出力する。

## 可視化（オプション）

トリガー規律・実行環境の解決・出力先・スタイル・安全規律は
`_shared/references/visualization-guide.md` に従う。**デフォルトは off**
（ユーザーが明示的に求めたとき、または提案に同意したときだけ描く）。
チャートはテキスト出力（テーブル + サマリー）の後に描き、
その置き換えにはしない。

本 skill の標準チャート:

| チャート ID | 内容 | 主な構成要素 |
|---|---|---|
| `indicator-analysis.price-overlay` | 価格 + トレンド系オーバーレイ | close の折れ線 + SMA(20/50/200) + ボリンジャーバンド(20, 2σ) の帯（半透明 fill）。y=価格（JPY）。凡例必須 |
| `indicator-analysis.oscillators` | オシレーター系サブプロット | 上段: RSI(14) と 30/70 の水平線。下段: MACD / シグナル / ヒストグラム。同一チャート ID 内のサブプロット構成（1 図 1 ファイルの規約内） |

チャート固有の注意:

- 図中の最新値はテキスト出力テーブルの値と一致していること
  （Validation Loop と同じ整合性検証を図にも適用する）
- warmup 期間（SMA(N) の最初の N-1 本等）の NaN 区間は描かない
- 未確定足の扱い（除外 or 明示）は本文の実行手順 5 と同じ
- 「今買い時？」への回答を図に描き込まない。矢印・BUY/SELL 注記は禁止
  （ガイドの安全規律。チャートは現在値の記述であり売買指示ではない）

## Gotchas

- **価格は文字列で返る。** 数値変換を忘れると文字列連結になり、計算結果が完全に壊れる。`ohlcv[0]`（open）等は `"9250000"` のような文字列なので、必ず数値変換してから計算する
- **配列は古い順。** 先頭がいちばん古い。逆に処理すると指標の方向が反転する
- **日付形式に注意。** `--type=1month` のときは `--date=2024`（年のみ）。それ以外は `--date=20240101`（YYYYMMDD）。間違えると空データが返る
- **十分なデータが必要。** データ不足だと指標が安定しない。SMA(200) には 200 本以上必要なので `--limit=300` 等で多めに取得する
- **ATR の計算には前足の close が必要。** 期間 N の ATR を出すには最低 N+1 本のデータが必要（最初の足は前足がないため TR を計算できない）
- **API がエラーを返した場合は `_shared/references/bitbank-api-formats.md` を読んでエラーコードを確認する**
- **1回のリクエストで取得できる最大件数に注意。** 足りない場合は `--date` を変えて複数回取得し、結合する
