# コントリビューションガイド

bitbank CLI & Agent Skills へのコントリビューションを歓迎します。
このファイルは **入口（ハブ）** です。詳細は各リンク先にまとまっているので、
ここでは要点とリンクだけを示します（重複記載は避けています）。

## セットアップ

```bash
npm ci   # 依存インストール（初回のみ）
```

このリポジトリに PR を送る場合は、開発用 hook をローカルで有効化してください:

```bash
./.contrib/setup.sh
```

これで lint / test / 設定保護の hook が `.claude/` 配下に symlink で復元されます
（`.claude/settings.json` と `.claude/hooks/` は `.gitignore` 済みなのでコミットには含まれません）。

- README:「[コントリビューター向けセットアップ](README.md#コントリビューター向けセットアップ)」
- [.contrib/setup.sh](.contrib/setup.sh) / [.contrib/README.md](.contrib/README.md)

## 開発規約

- 全体方針・アーキテクチャ: [CLAUDE.md](CLAUDE.md)
- コマンド追加手順: [.claude/rules/commands.md](.claude/rules/commands.md)
- Skill 追加手順: [.claude/rules/skills.md](.claude/rules/skills.md)
- trade 安全ガード: [.claude/rules/trading-safety.md](.claude/rules/trading-safety.md)
- 表記規約: [docs/dev/conventions.md](docs/dev/conventions.md)

## PR 前の品質ゲート

以下を全て green にしてから PR を出してください（順に `npm run typecheck` /
`npm run lint` / `npm test` でも可）:

```bash
npx tsc --noEmit       # 型チェック
npx biome check cli/   # lint
npx vitest run         # テスト
```

- chaos conventions（`cli/__tests__/chaos/conventions/`）が規約を機械検証します。
  違反したら無視・回避せず修正してください。
- 1 ファイル 100 行は目安。超える場合は冒頭に理由コメントを書きます（[CLAUDE.md](CLAUDE.md) 参照）。

## コミット規約

`<type>: <概要>` 形式（日本語可）。例: `docs: CONTRIBUTING.md を追加`

## ブランチ運用

`main` から feature ブランチを切って PR を出してください。`main` への直 push はしません。

## 脆弱性の報告

セキュリティ上の問題は **Issue で公開せず**、[SECURITY.md](SECURITY.md) のフロー
（GitHub の Private vulnerability reporting）に従って非公開で報告してください。

## リリース（メンテナ向け）

npm publish とバージョン同期は `npm version <bump>` 経由で行います（5 ファイルを自動同期、
**手動編集禁止**）。手順は [docs/dev/release.md](docs/dev/release.md) を参照してください。
