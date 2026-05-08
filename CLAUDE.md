# CLAUDE.md

bitbank API への薄い CLI アクセス層。分析ロジックは一切持たない。

## コマンド

```bash
npm test                # vitest 全テスト
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
- MCP サーバー（`bitbank-genesis-mcp-server`）は別リポ。直接 import しない
- コマンド追加 → `.claude/rules/commands.md`
- 取引安全設計 → `.claude/rules/trading-safety.md`

## リポジトリルール

- コミット: `<type>: <概要>`（日本語 OK）
- 外部依存最小。`tsx` で直接実行。ビルドステップなし
- 開発フェーズ → [`docs/dev/phases.md`](docs/dev/phases.md)
- Skill 追加 → `.claude/rules/skills.md`

## リリース手順

`npm version <patch|minor|major>` で version 系を一括同期する。`scripts.version`
フック経由で `scripts/sync-version.mjs` が走り、`package.json` と同じ version を
plugin manifest 4 種（`.claude-plugin/` `.cursor-plugin/` `.codex-plugin/`
`gemini-extension.json`）に転写してから commit + tag が作られる。手動で
版数を編集して整合を取らないこと（同期漏れの温床）。

```bash
npm version patch        # 0.1.0 → 0.1.1 (5 ファイル同期 + commit + tag)
git push --follow-tags   # tag を含めて push
npm publish --otp=<OTP>  # /tmp で動作確認してから
```
