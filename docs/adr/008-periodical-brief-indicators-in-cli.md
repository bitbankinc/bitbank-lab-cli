# ADR-008: 複数銘柄の商い状況ダイジェスト（periodical-brief）の指標計算を CLI で行う

## ステータス

Accepted（2026-09-14）

## コンテキスト

upstream issue #21（@aobathree）の提案。LLM エージェントが `bitbank candles` で生ローソク足
JSON を取得して分析すると、1 回の日次分析で**数万トークン**を消費し、RSI / MACD / SMA / ATR の
手計算も遅く検算コストがかかる。銘柄数を増やすとトークン消費が線形に増えるため、
「毎朝 3〜10 銘柄をざっと見る」用途が実質的に成立しない。

提案は、計算を CLI 側に寄せて **1 銘柄 3 行の圧縮ダイジェスト**だけを出す
`bitbank periodical-brief [pairs...] [--top N | --all]` と、対になる Skill 1 枚。
参考実装（Rust）と実測が添えられている:

- 1 銘柄 4 リクエスト（日足 = 今年 + 昨年の年間ファイル、時足 = 直近 2 日）、public のみ
- 同時 16 並列で 3 銘柄 0.1〜0.2 秒、全 44 銘柄 1.2 秒。**並列数無制限だと 30 銘柄超で
  15〜26 秒の失速が頻発**（エラーは返らず遅延する。トークンバケット型のレート制限と推定）
- 外部ラッパーから CLI をサブプロセス起動する方式（124 プロセス）と CLI 内部で API を
  直接叩く方式（1 プロセス）の比較で、壁時計時間はほぼ同じだが **CPU 時間は 42 倍差**
  （1.97 秒 vs 0.05 秒）。1〜2 コアの環境（小さなコンテナ・格安 VPS・cron 常駐）では
  壁時計時間に直接跳ね返る

判断が必要になった点:

1. RSI / MACD / SMA / ATR の計算は分析ロジックそのものであり、
   [ADR-002](002-no-analysis-logic-in-cli.md)「CLI に分析ロジックを持たない」と正面から衝突する。
   既存の例外（[ADR-004](004-tax-logic-in-cli-exception.md) の tax、
   [ADR-007](007-balance-history-reconstruction-in-cli.md) の balance-history）と同じ型の
   例外として扱えるか
2. `indicator-analysis` skill は同じ指標をモデル側に計算させている。二重定義にならないか
3. 「本日の出来高」「曜日別平均」の暦をどう切るか。CLI は「JST は表示用のみ」が規約
4. 一部の銘柄が取得に失敗したときの扱い

## 決定

1. **`periodical-brief` を public カテゴリのコマンドとして CLI に置き、指標計算を CLI 側で行う**
   （計算本体は `cli/brief/`）。ADR-002 の 3 つ目の例外とする。
2. **指標は確定足のみで計算する**。当日の日足は現在値と始値比の表示にだけ使い、
   RSI / MACD / SMA / ATR / 曜日別出来高には含めない（時刻によって値がブレないため）。
   定義は `skills/indicator-analysis/references/indicator-guide.md` に合わせる
   （EMA は先頭 N 本の SMA を初期値、RSI / ATR は Wilder 平滑化）。
3. **数値と前提だけを返し、売買判断は出さない**。出力には 3 行テキスト（`lines` / `text`）と
   その元になった数値、および前提の注記（`note`）を同梱する。
4. **同時実行数をガードする**（既定 16、`--concurrency` で 1〜64）。
5. **`--top N` / `--all` の母集団は現行の取扱い銘柄（`cli/pairs.ts` の `KNOWN_PAIRS`）に絞る**。
   tickers API に残る旧ティッカー（matic_jpy / rndr_jpy / mkr_jpy）と BTC 建てクロスペアは
   除外する。除外リストを別に持たず、補完と同じ静的一覧を単一ソースにする。
6. **失敗した銘柄は落とさず申告する**。成功した銘柄のダイジェストを返しつつ `errors` に
   積み、`Result.partial` を立てる。全銘柄が失敗したときだけ失敗を返す。
7. **「本日」と曜日は JST で切る**。API のキー（年間ファイル・`YYYYMMDD`）は従来どおり UTC。

## 理由

### なぜ CLI に置くのか（ADR-002 の例外）

ADR-002 が CLI から締め出したのは「**生データを渡せばモデルが再現できる**指標計算」である。
本コマンドの指標は単体では再現できるが、**再現させることの費用が用途を壊す**:

- **トークン。** 3 銘柄で数万トークン、44 銘柄なら桁が変わる。ダイジェストなら 44 銘柄でも
  約 130 行で、取得本数を増やしてもモデルが読む量は一定
- **検算コスト。** モデルが RSI を暗算した結果は検証できない。決定的なコードなら
  テストで固定できる（`cli/__tests__/brief/`）
- **プロセス資源。** issue の実測どおり、サブプロセス多重起動は CPU 時間 42 倍・
  ページフォルト 50 倍。cron / CI から毎朝回す用途では CLI 内部実装でしか成立しない

一方で ADR-002 の線は保つ。**判断は出さない。** 「買い時」「売り時」は返さず、
数値・位置関係（`<S20` 等）・前提だけを返す。ADR-007 と同じ形である。

### `indicator-analysis` skill との棲み分け

`indicator-analysis` は**単一銘柄を深く**読む（任意の期間・パラメータ・BB / ROC 等）。
`periodical-brief` は**複数銘柄を浅く**一覧する固定フォーマットで、パラメータを変えられない
（RSI14 / MACD 12-26-9 / SMA20-50-200 / ATR14 固定）。ダイジェストで気になった銘柄を
`indicator-analysis` へ渡す、という入口の役割であり、置き換えではない。
定義を indicator-guide に合わせたのは、両者の数値が食い違って読み手を混乱させないため。

### なぜ確定足のみか

当日足を含めると、同じ日の朝と夕方で RSI や SMA が変わり、cron で毎朝回す用途で
「昨日との差」が読めなくなる。参考実装と同じ判断。当日の値動きは現在値と始値比
（1 行目）で別に見せる。

### なぜ JST か（「JST は表示用のみ」との関係）

「本日ここまでの出来高」「土日の薄商い」は読み手の暦で切って初めて意味を持つ。
これは**表示の意味論**であって API のキー組み立てではない。年間ファイル・時足の
`YYYYMMDD` は `cli/date-utils.ts` の UTC 関数で組み立て、JST は `cli/brief/jst.ts` に閉じる
（epoch を +9h ずらして `getUTC*` で読み、ホスト TZ に依存しない。税務の `jstYear` と同じ手法）。

### なぜ失敗銘柄を落とさないか

44 銘柄のうち 1 銘柄の 5xx で全体を失敗にすると、cron 運用でブリーフ全体が届かなくなる。
逆に黙って落とすと「載っていない銘柄」に気づけない。ADR-007 の「打ち切りは黙って通さない」と
同じく、`errors` と `partial` の 2 経路で申告する。

## 検討した代替案

| 案 | 判定 |
|---|---|
| Skill 側でモデルに計算させる（現行の `indicator-analysis` を複数銘柄に回す） | 却下。上記のトークン・検算・資源の問題。issue の実測が「用途が成立しない」ことを示している |
| 外部ラッパー（別リポの script）で `bitbank candles` をサブプロセス起動する | 却下。CPU 時間 42 倍・125 プロセス。接続再利用も効かない |
| MCP 側にだけ実装する | 却下。cron / CI / 人間向けの用途が MCP では成立しない。ADR-001 の「CLI は薄い層」とも、この用途は CLI の守備範囲 |
| `--top` の母集団を tickers の `_jpy` 全件にする | 却下。旧ティッカーが混ざる（issue のレビュー指摘で参考実装も修正済み）。除外リストを持つより `KNOWN_PAIRS` に絞るほうが単一ソースになる |
| 一部失敗をエラーにする | 却下。cron 用途で全体が届かなくなる。申告付きで出す |

## 影響

- `cli/brief/`（取得・指標・計算・整形・並列ガード）、`cli/commands/public/periodical-brief.ts`、
  `cli/commands/public-brief-handler.ts`、`cli/commands/schema/defs-public-brief.ts` を追加。
  `package.json` の `files` に `cli/brief/` を追記（chaos `x22`）。ADR-002 の「影響」節に
  本 ADR への参照を追記した
- **`--format=table` はダイジェスト本文をそのまま出す**（表にしない）。人間 / cron 向けの
  経路で、`paper pnl` の `formatPnl` と同じ独自出力。`--format=json` / `--machine` は
  他コマンドと同じ envelope で、`data.text` に同じ本文が入る
- Skill `periodical-brief` を追加（「朝のブリーフ出して」「daily brief 回して」）。
  Skill は本コマンドを `--machine` で呼び、`data.text` を読んで一言添えるだけで、
  生ローソク足を文脈に入れない。深掘りは `indicator-analysis` / `volatility-profile` へ委ねる
- **同時実行の既定 16 はサーバ側の制限に依存する経験値**。失速が観測されたら
  `--concurrency` を下げる。CLI 共通のプロアクティブスロットル（`cli/throttle.ts`）は
  そのまま効く
- 残る宿題: `BITBANK_BRIEF_PAIRS` のような既定銘柄の環境変数（参考実装にはある）、
  `--period` 等のパラメータ化は本 ADR の範囲外。パラメータ化するなら `indicator-analysis` との
  棲み分けを改めて決める
