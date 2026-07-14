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
- 依存クールダウン（`.npmrc` / Dependabot）: [docs/dev/dependency-cooldown.md](docs/dev/dependency-cooldown.md)

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

## リポジトリ履歴

`git log` / `git blame` は公開時の squash により root コミットまでしか遡れません
（root は `git rev-list --max-parents=0 origin/main` で確認できます）。公開以前の
設計判断は [`docs/adr/`](docs/adr/)、初期投入の経緯・リリース履歴は
[CHANGELOG.md](CHANGELOG.md) を参照してください。

## 脆弱性の報告

セキュリティ上の問題は **Issue で公開せず**、[SECURITY.md](SECURITY.md) のフロー
（GitHub の Private vulnerability reporting）に従って非公開で報告してください。

## リリース（メンテナ向け）

npm publish は tag push で `.github/workflows/release.yml` が起動し、version 注入・
plugin manifest 同期・agents カタログ再生成を経て publish する。手順は
[docs/dev/release.md](docs/dev/release.md) を参照してください。
