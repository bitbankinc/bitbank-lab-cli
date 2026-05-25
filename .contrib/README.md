# `.contrib/` — 開発者専用ファイル

このディレクトリは **このリポジトリにコントリビュートする開発者向け** のもの。
clone して CLI / Skills を使うだけのユーザーは無視してよい。

## 中身

- `hooks/` — Claude Code 用の品質ガード hook（lint / test / 設定保護）
- `claude-settings.json` — 上記 hook を発火させる Claude Code 設定
- `cursorrules` — Cursor の評価担当用指示書（root に symlink される）
- `setup.sh` — `.claude/` 配下と root に symlink を張って有効化
- `teardown.sh` — symlink を外す

## セットアップ

リポジトリを clone してコントリビュートする場合のみ、以下を一度実行する:

    ./.contrib/setup.sh

これで `.claude/settings.json` と `.claude/hooks/` が symlink で復元され、
Claude Code を立ち上げると hook が発火するようになる。

`.claude/settings.json` と `.claude/hooks/` は `.gitignore` 済みなので、
誤って commit される心配はない。

## なぜこの構成？

`.claude/` は Claude Code / Cursor の規約ディレクトリで、`skills/` と
`rules/` を配布物として置いている。一方 `hooks/` と `settings.json` は
**このリポジトリの開発時にだけ動いてほしい** ものなので、配布物に混ぜず
`.contrib/` に退避している（クローン者の Claude Code で Stop イベントごとに
`npm test` が発火する事故を防ぐため）。

`.cursorrules` も同じ理由で `.contrib/cursorrules` を実体に置き、root には
symlink として配置している。配布物には含まれないが、メンテナの編集は
git で追えるようになっている。
