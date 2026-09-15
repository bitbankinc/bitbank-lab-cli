# CLAUDE.md

bitbank API への薄い CLI アクセス層。分析ロジックは一切持たない。

## コマンド

```bash
npm ci                  # 初回のみ依存インストール
npm test                # vitest 全テスト（1回実行して終了）
npm run test:watch      # vitest ウォッチモード
npx tsx cli/index.ts    # CLI 実行
```

## コード品質

- chaos テスト（`cli/__tests__/chaos/conventions/`）が検証する規約に従う。
  違反したら無視・回避せず修正する。
- CLI の責務は API データの取得と整形のみ。
  **例外: `paper` サブコマンド** はライブ価格 × 仮想資金のシミュレーション
  のため、ローカル状態（`~/.bitbank/paper-state.json`）を読み書きする。
  これは **public エンドポイントのみ**を叩く読み取り専用の sim であり、
  private/trade エンドポイントは絶対に叩かない。実際に使うのは ticker・
  candlestick（指値約定の判定）・pairs（発注量の検証）の 3 つ
- **例外: `tax` サブコマンド**（[ADR-004](docs/adr/004-tax-logic-in-cli-exception.md)）は
  税務・会計データ整形のため CLI 内で損益計算を行う。税務は「間違えられない」領域で、
  LLM に計算させられないための例外。**private GET のみで POST は絶対に叩かない**。
  数値は厳密有理数で保持し、丸めは境界で 1 回だけ
  （[ADR-005](docs/adr/005-tax-exact-rational-arithmetic.md)）。
  年分判定は JST（「JST は表示用のみ」規約の例外。`cli/date-utils.ts`）。
  ユーザー指定の CSV（年間取引報告書など）は**読むだけ**で、書き出しも送信もしない。
  出力は「税務上の所得金額」ではなく **税計算用参考データ** と呼ぶ。
  参考損益は表示ガードが成立した銘柄でだけ数値を出す。ガードの保護対象と
  唯一の対象外（verify-report の信用損益）は
  [ADR-006](docs/adr/006-reference-pnl-guard-scope.md)
- **例外: `balance-history`**（[ADR-007](docs/adr/007-balance-history-reconstruction-in-cli.md)）は
  現在の残高から約定・入出金を逆算して各時点の保有を復元する。生データを渡してもモデルには
  再現できず、間違いが静かなための例外。計算本体は `cli/portfolio/`、移植元は姉妹リポ
  `bitbank-lab-mcp`（各ファイル冒頭に明記）。**private GET のみ**。数値は倍精度で、
  ADR-005 の厳密有理数は税務経路に限る。履歴の打ち切りは
  `partial` / `meta.truncated` / `completeness` / `warnings` の 4 経路で申告する
- **例外: `periodical-brief`**（[ADR-008](docs/adr/008-periodical-brief-indicators-in-cli.md)）は
  複数銘柄の RSI / MACD / SMA / ATR と曜日別出来高を CLI 側で計算し、1 銘柄 3 行に圧縮して返す。
  生ローソク足を LLM に渡すと数万トークンを消費し検算も高コストなための例外。
  計算本体は `cli/brief/`。**public GET のみ**・指標は**確定足のみ**で計算・売買判断は出さない。
  一部銘柄の失敗は `errors` + `partial` で申告し、全銘柄失敗時だけ Result failure を返す
- **1 ファイル 100 行は目安**。超えたら設計を見直す（責務が広がっていないか、
  リトライ・パース・整形などが混ざっていないか）。どうしても超過に妥当な
  理由がある場合は、ファイル冒頭にコメントで理由を書く
  （例: `// 100行超: bitbank API のエラーコードマッピングを集約`）。
  **空行詰め・コメント削除で 100 行に収めるのは禁止**（構造の問題を表面で隠す行為）

## アーキテクチャ

- Zod スキーマ（`z.infer`）が型の単一ソース
- 全コマンドは Result パターンで返す（例外は使わない）
- MCP サーバー（`bitbank-lab-mcp`）は別リポ。直接 import しない
- コマンド追加 → `.claude/rules/commands.md`
- 取引安全設計 → `.claude/rules/trading-safety.md`
- 機械可読カタログ → [`agents/`](agents/)。`tool-catalog.json`（全コマンド・
  params(JSON Schema)・output・`dangerous`/`confirm` フラグ）、`error-catalog.json`
  （エラーコード→カテゴリ + retry 指針）、`chart-catalog.json`（skill 標準チャートの
  ID・仕様。描画規約は `skills/_shared/references/visualization-guide.md`）を
  `scripts/gen-agents-catalog.ts` が単一ソースから生成する。**手書き禁止**
  （chaos `x17` が regenerate との差分ゼロを検査）。
  LLM は CLI を実行せず repo を読むだけで全コマンドと安全フラグを把握できる

## リポジトリルール

- コミット: `<type>: <概要>`（日本語 OK）
- 外部依存最小。`tsx` で直接実行。ビルドステップなし
- 開発フェーズ → [`docs/dev/phases.md`](docs/dev/phases.md)
- リリース手順 → [`docs/dev/release.md`](docs/dev/release.md)（tag push で release.yml が
  version 注入・plugin manifest 同期・npm publish・GitHub Release を実行）
- Skill 追加 → `.claude/rules/skills.md`
- ADR 追加 → `.claude/rules/adr.md`（採番は最大番号 + 1。chaos `x21` が
  番号重複・構成を検査する）
