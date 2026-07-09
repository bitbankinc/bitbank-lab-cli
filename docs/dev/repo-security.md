# リポジトリセキュリティ設定（初回のみ）

GitHub / npm 側で 1 回だけ設定する手動セットアップ。コードでは表現できない
（=コミットでは追えない）ため、ここに集約する。

## GitHub: Branch protection

`main` への直 push を禁止し、PR 経由 + CI green を必須にする。
アカウント乗っ取り時の被害を局所化する目的。

Settings → Branches → Add branch protection rule:

- **Branch name pattern**: `main`
- ✅ Require a pull request before merging
  - Required approvals: 1（個人運用なら 0 でも可、ただし self-review は必須に）
  - ✅ Dismiss stale approvals when new commits are pushed
- ✅ Require status checks to pass before merging
  - ✅ Require branches to be up to date before merging
  - 必須 check:
    - `test`（`.github/workflows/ci.yml` の job 名）
    - `audit`（`.github/workflows/security.yml` の job 名）
    - `gitleaks`（`.github/workflows/security.yml` の job 名。全 git 履歴の秘密情報スキャン）
- ✅ Require conversation resolution before merging
- ✅ Do not allow bypassing the above settings（admin も含めて enforce）
- ❌ Allow force pushes / deletions（無効のまま）

`v*` tag は workflow から push されないので tag protection は任意。
誤削除防止に Settings → Tags → `v*` の保護を追加してもよい。

## GitHub: Private vulnerability reporting

Settings → Code security → Private vulnerability reporting → **Enable**

これで `SECURITY.md` の報告フローが有効になる
（Security タブから "Report a vulnerability" が出る）。

## GitHub: Dependabot alerts / security updates

Settings → Code security:

- ✅ Dependabot alerts
- ✅ Dependabot security updates
- ✅ Dependency graph

`.github/dependabot.yml` は通常更新用。security updates は別系統で
critical / high の patch PR を即時に出す（version update 側の cooldown は
適用されない。[dependency-cooldown.md](dependency-cooldown.md) 参照）。

## npm: 2FA を auth-and-writes に

https://www.npmjs.com/settings/<user>/profile → Two-factor authentication

- レベルを **Authorization and writes** に設定
- これで publish / owner 変更にも OTP が必要になる
- OIDC trusted publishing は OTP 不要のままなので CI フローには影響しない

## npm: Trusted Publisher 登録

`docs/dev/release.md` の「OIDC trusted publishing 設定」セクションを参照。

## 確認チェックリスト

セットアップ済みかは以下で確認できる:

- Branch protection: `gh api repos/bitbankinc/bitbank-lab-cli/branches/main/protection` が 200 を返すか
- Private vulnerability reporting: Settings → Code security のチェック状態
- npm 2FA: `npm profile get` の `tfa` 欄が `auth-and-writes`
- Trusted Publisher: https://www.npmjs.com/package/bitbank-lab-cli/access で表示されるか
