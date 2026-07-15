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
  これは public ticker のみを叩く読み取り専用の sim であり、
  private/trade エンドポイントは絶対に叩かない
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
