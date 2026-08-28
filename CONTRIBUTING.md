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

## 秘密情報の誤コミット防止（gitleaks）

pre-commit フック（lefthook）が、ステージ済みの**内容**を gitleaks で走査する
（フック自体は `npm ci` の lefthook postinstall で `.git/hooks/` に配線される）。
CI の Security Audit がやっている検査を commit 時点に前倒しし、鍵がリポジトリに入る前に
止める（使う gitleaks のバージョンは CI と一致するとは限らない。後述）。

**gitleaks のインストールを強く推奨する。** 未導入でも commit は通るが、その場合
ローカルの秘密情報チェックは効いていない（警告を出してスキップする）:

```bash
brew install gitleaks          # macOS
# その他: https://github.com/gitleaks/gitleaks#installing
gitleaks version               # CI は 8.30.1 に固定。ローカルも同等以上を推奨
```

CI（`.github/workflows/security.yml`）は SHA256 検証済みの **8.30.1** を使う。ローカルは
PATH 上の gitleaks を使うためバージョンが一致するとは限らないが、検出ルールは版で増えるので
新しい側に倒しておく。最終的な判定は CI の固定バージョンが行う。

### 環境変数

| 変数 | 効果 |
|---|---|
| `LEFTHOOK_REQUIRE_GITLEAKS=1` | gitleaks 未導入を**エラー**として commit を中断する。厳格に運用したい場合に設定する |
| `LEFTHOOK_SKIP_GITLEAKS=1` | スキャン自体をスキップする。回避した理由を PR に必ず明記すること |

いずれも値が `1` のときだけ有効。`0` や `false` を設定しても既定の動作のままになる。

**誤検知だった場合**は、実鍵でないことを確認したうえで、行末に**その言語のコメント構文で**
`gitleaks:allow` を付ける（TypeScript なら `// gitleaks:allow`、shell / YAML なら
`# gitleaks:allow`）。JSON のようにコメントを書けない形式では代わりに `.gitleaksignore` に
fingerprint と理由コメントを追加する。`LEFTHOOK_SKIP_GITLEAKS` での回避は最後の手段とする。

ファイル名ベースの検査（`.env` / `.env.*` / `*.pem` / `*.key` / `id_rsa*` / `id_ed25519*` /
`credentials.json`。`.env.example` のみ除外）は
同じ pre-commit の `secret-file-names` が担う。`.gitignore` は `git add -f` と追跡済みファイルを
防げないため、2 段構えにしている。

### なぜ pre-commit で止めるのか

一度 commit すると、鍵は git 履歴に残る。push 前に気づいても、除去には履歴の書き換えと
鍵の失効・再発行が必要で、push 後であればなおさら手間が増える。

CI の gitleaks（`.github/workflows/security.yml`）は全履歴をスキャンする最終防衛線だが、
そこで検知した時点では既に履歴に入っている。**履歴に入る前に止められる唯一の場所が
pre-commit** なので、ここを本命の防御と位置づけている。

GitHub の Push protection も push 時点の網で、かつ bitbank は secret scanning の
パートナーではないため **bitbank API キー専用の検出器が存在しない**（詳細は
[docs/dev/repo-security.md](docs/dev/repo-security.md)）。

## 開発規約

- 全体方針・アーキテクチャ: [CLAUDE.md](CLAUDE.md)
- コマンド追加手順: [.claude/rules/commands.md](.claude/rules/commands.md)
- Skill 追加手順: [.claude/rules/skills.md](.claude/rules/skills.md)
- trade 安全ガード: [.claude/rules/trading-safety.md](.claude/rules/trading-safety.md)
- 表記規約: [docs/dev/conventions.md](docs/dev/conventions.md)
- 依存クールダウン（`.npmrc` / Dependabot）: [docs/dev/dependency-cooldown.md](docs/dev/dependency-cooldown.md)

## 実口座データの取り扱い

実口座のデータ（API の生レスポンス・UI CSV エクスポート・残高スナップショット等）を
**本リポジトリにコミットしないでください**。本リポジトリは公開されており、金額・日時・銘柄の
系列は匿名化が困難です。

- 検証は別環境で行い、リポジトリには**観測事実のみ**を記載する
- 生データを扱うコード（収集・マスク・突合ツール等）は追跡してよい。データ本体だけを除外する
  （`.gitignore` は `fixtures/raw/` 等のデータパスのみを対象にしています）
- 検査は 2 段構え。`.gitignore` は `git add -f` や追跡済みファイルを防げないため、
  それぞれ役割が違います
  - `pre-commit` の `no-real-account-data`: **手元での早期検出**。`--no-verify` で迂回できるので
    最終防波堤ではありません
  - CI の `No real account data tracked`: **必須チェック**。追跡ファイル全体を毎回検査するため、
    フックの迂回や過去分の混入も落ちます

ドキュメントに実データ由来の観測を書くときの規律:

1. **値は丸める**（例: `+0.00041693` → `+約0.0004`）
2. **丸めた旨を注記する**（読み手が正確な再現を試みないように）
3. **恒等式の検算は値を丸めず関係式で表す**（`a + b = c` を丸めると足が合わなくなり、
   かえって証拠価値が失われる。例: `profit_loss = 値幅損益 − Σfee − interest`）

詳細は [docs/dev/tax-fixtures-plan.md](docs/dev/tax-fixtures-plan.md) を参照してください。

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
