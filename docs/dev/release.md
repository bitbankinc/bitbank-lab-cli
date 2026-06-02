# リリース手順

`bitbank-lab-cli` の npm publish フロー。

## バージョン同期

`package.json` と plugin manifest 4 種（`.claude-plugin/plugin.json` /
`.cursor-plugin/plugin.json` / `.codex-plugin/plugin.json` /
`gemini-extension.json`）の 5 ファイルが同じ version を持つ必要がある。
**手動で個別編集しないこと**（同期漏れの温床）。

`.claude-plugin/marketplace.json` も同じディレクトリにあるが、これは
plugin manifest ではなく marketplace カタログ。plugin の version 同期
対象外なので `scripts/sync-version.mjs` の targets には入れない
（オプションの `version` フィールドを将来追加する場合も同様）。

`npm version <bump>` 実行時に `scripts.version` フック経由で
`scripts/sync-version.mjs` が走り、`package.json` の新 version を
plugin manifest に転写してから commit + tag が作られる。

あわせて同フックが `scripts/gen-agents-catalog.ts` を再実行し、
`agents/tool-catalog.json` / `agents/error-catalog.json`（どちらも
`cli_version` を埋め込む生成物）を新 version で再生成してステージする。
これらは手書きせず常に再生成する。再生成漏れは x17 ドリフトテストが
CI で検出する（`cli/__tests__/chaos/conventions/x17-agents-catalog-drift.test.ts`）。

## 手順

```bash
npm version patch        # 0.1.0 → 0.1.1 (5 ファイル同期 + commit + tag)
git push --follow-tags   # tag を含めて push
# tag を push すると .github/workflows/release.yml が起動し、
# OIDC trusted publishing 経由で `npm publish --provenance` を実行する。
# 完了後に /tmp で動作確認 (鉄則)
cd /tmp && npx -y bitbank-lab-cli@<新 version> ticker btc_jpy
```

### 手動 publish（フォールバック）

OIDC が使えない / workflow が失敗した場合の緊急用:

```bash
npm publish --otp=<OTP>
```

`--provenance` は OIDC 経由でしか付かないため、手動 publish したバージョンは
provenance 表示が無くなる点に注意。

## OIDC trusted publishing 設定（初回のみ）

1. https://www.npmjs.com/package/bitbank-lab-cli/access で
   "Trusted Publisher" を追加
2. GitHub repo: `tjackiet/bitbank-cli-skills`、workflow: `release.yml`、
   environment は空でよい
3. アカウント側で 2FA を `auth-and-writes` に設定（手動 publish 時の保険）

その他のリポジトリ側初回設定（branch protection / private vulnerability
reporting 等）は [`repo-security.md`](repo-security.md) を参照。

`patch` / `minor` / `major` は SemVer に従う。0.x は SemVer 上 minor で
breaking 可なので初期改修は `npm version patch` で増やしていく。

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
