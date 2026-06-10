# Security Policy

## サポート対象バージョン

`bitbank-lab-cli` は最新の minor 系列のみをサポートします。
0.x の間は最新 patch のみがセキュリティ修正の対象です。

| Version | サポート |
|---------|----------|
| 最新の 0.x.y | ✅ |
| それ以前 | ❌ |

## 脆弱性の報告方法

本リポジトリは bitbank のバグバウンティプログラムの対象範囲外です。
bitbank のバグバウンティ scope は `bitbank.cc` / `app.bitbank.cc` / `api.bitbank.cc` のみが対象であり、本リポジトリで発見された脆弱性に対する報奨金の支払いはありません（詳細: [bitbank セキュリティについて](https://bitbank.cc/doc/security-about)）。

ただし、セキュリティに関するご指摘はコントリビューションとして歓迎します。**機微な内容（未公開の脆弱性など）は GitHub の "Private vulnerability reporting" をご利用ください。**

https://github.com/tjackiet/bitbank-lab-cli/security/advisories/new から
非公開でご報告ください。

ご報告に含めていただきたい情報:

- 影響を受けるバージョン
- 再現手順（最小ケース）
- 想定される影響（資金影響の有無 / 鍵漏洩の可能性 / リモート実行の可否）
- PoC があれば添付

## スコープ

### 対象

- `cli/` 配下のコード（公開された CLI で再現できる挙動）
- 公開済み npm パッケージ `bitbank-lab-cli` の tarball 内容
- API 鍵の取り扱い（`profiles.json`、env、HMAC 署名）に関する欠陥
- trade コマンドの安全ガード（`--execute` / `--confirm`）の bypass

### 対象外

- bitbank API 自体の脆弱性（[bitbank セキュリティについて](https://bitbank.cc/doc/security-about) に従ってご報告ください）
- ユーザーが手元で書いた skill / hook / plugin の挙動
- 既知の制約（POST 失敗時の silent success 等。`trading-safety.md` 記載）
- ソーシャルエンジニアリング / フィッシング

## 報告者への対応

- 受領後に CVE 採番が妥当な severity であれば GHSA を起票します
- 修正版リリース時に CHANGELOG / GHSA 上でクレジット表記します（希望者のみ）

## 現在の対策

- `npm audit` を CI で二段実行（ci.yml で critical 警告、security.yml で high ブロッキング + 週次スケジュール）
- Dependabot で依存を weekly 更新
- OIDC trusted publishing + `--provenance` で改ざん検出を可能化
- `files` allowlist で不要ファイル（`.env*` 等）を tarball から排除
- POST はリトライ無効化で冪等性を保護（`trading-safety.md` 参照）

リポジトリ側のセキュリティ設定（branch protection / 2FA 等）は
[`docs/dev/repo-security.md`](docs/dev/repo-security.md) を参照してください。
