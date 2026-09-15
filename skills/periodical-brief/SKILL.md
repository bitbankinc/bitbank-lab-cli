---
name: periodical-brief
description: |
  複数銘柄の商い状況を 1 銘柄 3 行のダイジェスト（現在値・RSI14・MACD 符号・SMA20/50/200
  との位置・曜日別出来高・直近確定日の値動き・ATR14）で一気に眺める。計算は CLI
  （`bitbank periodical-brief`）が確定日足だけで行い、Skill 側では計算しない。
  生ローソク足を文脈に入れないので、銘柄を増やしても 1 銘柄あたり 3 行しか増えない。
  代表トリガー: 「朝のブリーフ出して」「daily brief 回して」「主要銘柄ざっと見せて」
  「出来高上位 10 銘柄の様子は？」「全銘柄の商い状況」
  注意: 単一銘柄を深く読む（任意の期間・パラメータ・BB 等）のは indicator-analysis、
  リスク特性は volatility-profile が担当。本 skill は複数銘柄を浅く一覧する入口で、
  売買判断は出さない。
compatibility: |
  Requires the bitbank CLI on PATH (install separately: npm i -g bitbank-lab-cli).
  Plugin install alone does NOT bundle the CLI or its dependencies. Node.js 22+.
metadata:
  author: bitbankinc
  version: "1.0"
  requires:
    bins:
      - bitbank
---

# Periodical Brief Skill

`bitbank periodical-brief` を 1 回呼び、返ってきたダイジェスト（`data.text`）を**そのまま提示して
一言添える**。指標の再計算・生ローソク足の取得はしない（計算は CLI 側に閉じている。
[ADR-008](../../docs/adr/008-periodical-brief-indicators-in-cli.md)）。

## いつ使うか

代表トリガー以外にも以下のような発話で起動する:

- 「今日の相場ざっと」「週末の商い薄い？」「どの銘柄が動いてる？」
- cron / 定期実行で毎朝ブリーフを出したい、という相談

単一銘柄について「RSI 見て」「買い時？」と聞かれたら本 skill ではなく
`indicator-analysis` を使う。ダイジェストで気になった銘柄の深掘りも同様。

## 実行フロー

### Plan

1. 対象銘柄を決める。指定が無ければ既定（btc_jpy / eth_jpy / xrp_jpy）。
   「上位 N」なら `--top=N`、「全部」なら `--all`（現行の取扱い JPY 建て銘柄を
   24h 売買代金の降順で並べる）。
2. CLI の起動方法は `_shared/references/cli-conventions.md` の「起動方法の解決手順」に従う。

### Validate

- 明示された pair は `_shared/references/pair-classification.md` の有効ペアか確認する。
- `--top` / `--all` / 明示 pair は排他。同時に指定しない。

### Execute

```bash
# 既定の 3 銘柄
bitbank periodical-brief --format=json --machine

# 明示指定（位置引数、または --pairs=btc_jpy,sol_jpy）
bitbank periodical-brief btc_jpy sol_jpy --format=json --machine

# 24h 売買代金上位 10 銘柄 / 全銘柄
bitbank periodical-brief --top=10 --format=json --machine
bitbank periodical-brief --all --format=json --machine
```

`--concurrency=<n>`（既定 16、1〜64）で同時リクエスト数を下げられる。
失速（応答が 10 秒超）を観測したら 8 程度に下げる。

人間 / cron 向けには `--format=table` がダイジェスト本文をそのまま出す（表にはしない）。
skill 経路では envelope の `success` / `partial` / `meta` を読める `--machine` を使う。

## 出力の読み方

`data.text` はヘッダ 1 行 + 各銘柄 3 行:

```
# bitbank periodical brief 2026-08-02 Sun JST 10:30  (3 pairs)
## btc_jpy  px=9,919,488 (+0.2% intraday)  RSI36 MACD- trend:DOWN[<S20 <S50 <S200]  ※日足未確定
   vol today(JST,so far)=42.1 | wk=117.0 sat=49.0(42%) sun=54.0 30d=97.0
   Sat 08-01(確定): 9,920,000->9,897,393 (-0.2%)  ATR14=275,862
```

| 行 | 項目 | 意味 |
|---|---|---|
| 1 | `px` / `intraday` | 直近日足の終値と始値比。当日足が未確定なら現在値相当で `※日足未確定` が付く |
| 1 | `RSI` / `MACD±` | RSI14 と MACD ヒストグラム（12-26-9）の符号。**確定足のみ**で計算 |
| 1 | `trend[...]` | SMA20/50/200 との位置。2 本以上下なら DOWN、全部上なら UP、それ以外 MIX。本数不足の SMA は載らない |
| 2 | `vol today` | JST 当日 0:00 から現在までの出来高（途中経過） |
| 2 | `wk / sat / sun / 30d` | 直近 30 本の確定日足を JST の曜日で分けた 1 日平均。`sat=…(42%)` は土曜 ÷ 平日 |
| 3 | `(確定)` | 直近の確定日足の始値→終値と変化率 |
| 3 | `ATR14` | Wilder 平滑化の ATR。ストップ幅の目安（価格と同じ単位） |

`data.pairs[]` に同じ内容の数値（`rsi14` / `macd_hist` / `sma20` … / `volume` / `last_confirmed` /
`atr14`）が入るので、比較や並べ替えが要るときはそちらを使う。`data.note` に前提が書いてある。

## 提示のしかた

- `data.text` を**コードブロックで丸ごと**見せる。要約して行を削らない（圧縮済みが売り）。
- 添えるのは 2〜3 文まで: 目立つ点（RSI の極端値、全 SMA 下抜け、週末の薄商い、
  未確定注記）を指摘し、深掘りが要りそうな銘柄を `indicator-analysis` /
  `volatility-profile` へ案内する。
- **売買判断は出さない**。「買い時」「売り時」と聞かれたら `indicator-analysis` へ。

## Gotchas

- **`partial: true` を見落とさない。** 一部銘柄の取得に失敗すると成功扱いのまま
  `data.errors[]` に積まれ、`text` 内は `## <pair>  ERROR: …` 行になる。載っていない
  銘柄があると誤読するので、`errors` が空でなければその旨を先に言う。
- **当日足は指標に含まれない。** `※日足未確定` は「まだ当日分が確定していない」注記で、
  RSI / SMA は前日までの確定足で計算されている。夕方でも朝でも指標の値は同じ。
- **`--top` / `--all` の母集団は現行の取扱い JPY 建て銘柄**（旧ティッカー・BTC 建ては除外）。
  ランキングは 24h 出来高 × 現在値で、tickers を 1 回余分に叩く。母集団は `cli/pairs.ts` の
  `KNOWN_PAIRS`（静的一覧）なので、新規上場ペアは同ファイルと
  `_shared/references/pair-classification.md` に追記されるまで `--all` / `--top` に載らない。
  明示指定（位置引数）なら未登録でも取得できる。
- **新規上場銘柄は SMA200 / 曜日平均が揃わない。** `n/a` と `sample_days < 30` で分かる。
- **同時実行数を上げない。** 無制限にすると 30 銘柄超で 15〜26 秒失速する（issue #21 の実測）。
  遅いときは `--concurrency` を下げる方向で調整する。
- 定期実行では `--format=table` の本文をそのまま通知に流せる。`--machine` の JSON を
  貼るとトークンを無駄にする。
