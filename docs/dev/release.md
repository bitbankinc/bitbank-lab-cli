# リリース手順

`bitbank-lab-cli` の npm publish フロー。`bitbank-lab-mcp` と同じ
tag 駆動 + GitHub Actions 多段階パイプライン。

## ワークフロー概要

`.github/workflows/release.yml` は 3 job で構成される:

1. `ci` — tag 上のコードで lint / typecheck / test を再実行
2. `npm-publish` — tag から version を注入し plugin manifest・agents カタログを
   同期してから `npm publish --provenance`
3. `github-release` — GitHub Release を自動作成（リリースノート自動生成）

トリガー:

- `v*` tag の push（通常ルート）
- `workflow_dispatch`（手動起動、tag 名を入力）

## バージョン同期

publish 時に release workflow が以下を実行する（ローカルでの事前同期は不要）:

1. `npm version <tag-version> --no-git-tag-version` — `package.json` を tag に合わせる
2. `scripts/sync-version.mjs` — plugin manifest 5 種 + ルート `plugin.json` へ転写
3. `scripts/gen-agents-catalog.ts` — `agents/tool-catalog.json` /
   `agents/error-catalog.json` を再生成（`cli_version` を埋め込む）

対象ファイル（計 6 + 生成物 2）:

- `package.json`
- `.claude-plugin/plugin.json` / `.cursor-plugin/plugin.json` /
  `.codex-plugin/plugin.json` / `gemini-extension.json` / `plugin.json`
- `agents/tool-catalog.json` / `agents/error-catalog.json`

ルートの `plugin.json` は Antigravity CLI（旧 Gemini CLI）のネイティブ
plugin manifest。旧 CLI 互換の `gemini-extension.json` と両置きすることで
新旧どちらの CLI からもリモート install できる。

`.claude-plugin/marketplace.json` は marketplace カタログであり version 同期
対象外（`scripts/sync-version.mjs` の targets に入れない）。

main ブランチ上の `package.json` / plugin manifest は、公開済み npm version と
一致しないことがある（MCP と同様）。npm tarball 内では publish 直前に全て
揃う。

## 手順

```bash
# 1. CHANGELOG の [Unreleased] を更新して main にマージ

# 2. tag を作成して push
git tag v0.2.1
git push origin v0.2.1

# tag push で release.yml が起動し、OIDC trusted publishing 経由で
# npm publish + GitHub Release が実行される。

# 3. 完了後に /tmp で動作確認 (鉄則)
cd /tmp && npx -y bitbank-lab-cli@0.2.1 ticker btc_jpy
```

### prerelease

`-alpha` / `-beta` / `-rc` を含む tag は npm dist-tag `beta` で公開され、
GitHub Release は prerelease として作成される:

```bash
git tag v0.3.0-beta.1
git push origin v0.3.0-beta.1
```

### 手動起動（workflow_dispatch）

GitHub Actions の Release workflow から手動実行し、tag 名（例: `v0.2.1`）を
指定できる。通常は tag push で十分。

### 手動 publish（フォールバック）

OIDC が使えない / workflow が失敗した場合の緊急用:

```bash
VERSION=0.2.1
npm version "$VERSION" --no-git-tag-version
node scripts/sync-version.mjs
npx tsx scripts/gen-agents-catalog.ts
npm publish --otp=<OTP>
```

`--provenance` は OIDC 経由でしか付かないため、手動 publish したバージョンは
provenance 表示が無くなる点に注意。

## OIDC trusted publishing 設定（初回のみ）

1. https://www.npmjs.com/package/bitbank-lab-cli/access で
   "Trusted Publisher" を追加
2. GitHub repo: `bitbankinc/bitbank-lab-cli`、workflow: `release.yml`、
   environment: `production`
3. GitHub repo に `production` environment を作成（Settings → Environments）
4. アカウント側で 2FA を `auth-and-writes` に設定（手動 publish 時の保険）

その他のリポジトリ側初回設定（branch protection / private vulnerability
reporting 等）は [`repo-security.md`](repo-security.md) を参照。

`patch` / `minor` / `major` は SemVer に従う。0.x は SemVer 上 minor で
breaking 可なので初期改修は patch 相当の tag を増やしていく。

## publish 後の検証

publish 直後に必ず別環境（`/tmp` 等）で動作確認する。npm registry の
反映には数秒〜数十秒かかるので少し待ってから:

```bash
npx -y bitbank-lab-cli@<新 version> --help
npx -y bitbank-lab-cli@<新 version> ticker btc_jpy
```

unpublish は publish 後 24 時間以内のみ可能。それ以降は deprecate しか
できないので、publish 前の `npm pack --dry-run` 確認 + `/tmp` 検証は
省略しないこと。

## owner 移管（将来）

公式 org への移管は npm 上で連続的に引き継げる:

```bash
npm owner add bitbankinc bitbank-lab-cli
npm owner rm tjackiet bitbank-lab-cli
```

GitHub repo の transfer も並行してやる。
