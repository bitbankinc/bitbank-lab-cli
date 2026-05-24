# Security Policy

## サポート対象バージョン

`bitbank-lab-cli` は最新の minor 系列のみをサポートする。
0.x の間は最新 patch のみがセキュリティ修正の対象。

| Version | サポート |
|---------|----------|
| 最新の 0.x.y | ✅ |
| それ以前 | ❌ |

## 脆弱性の報告方法

**GitHub の "Private vulnerability reporting" を使ってほしい。**

1. https://github.com/tjackiet/bitbank-cli-skills/security/advisories/new から
   非公開で報告
2. public な Issue / Discussion / PR には書かない（修正前に晒さない）

報告に含めてほしい情報:

- 影響を受けるバージョン
- 再現手順（最小ケース）
- 想定される影響（資金影響の有無 / 鍵漏洩の可能性 / リモート実行の可否）
- PoC があれば添付

## 対応 SLA（努力目標）

- 初回応答: 7 日以内
- 重大度評価と修正方針の連絡: 14 日以内
- 修正リリース: severity に応じて調整（critical は最優先）

個人運用のため厳密な SLA は約束できないが、上記を目安に動く。

## スコープ

### 対象

- `cli/` 配下のコード（公開された CLI で再現できる挙動）
- 公開済み npm パッケージ `bitbank-lab-cli` の tarball 内容
- API 鍵の取り扱い（`profiles.json`、env、HMAC 署名）に関する欠陥
- trade コマンドの安全ガード（`--execute` / `--confirm`）の bypass

### 対象外

- bitbank API 自体の脆弱性（[bitbank へ直接報告](https://bitbank.cc/) してほしい）
- ユーザーが手元で書いた skill / hook / plugin の挙動
- 既知の制約（POST 失敗時の silent success 等。`trading-safety.md` 記載）
- ソーシャルエンジニアリング / フィッシング

## 報告者への対応

- 受領後に CVE 採番が妥当な severity であれば GHSA を起票する
- 修正版リリース時に CHANGELOG / GHSA 上で謝辞を記載（希望者のみ）
- 報奨金プログラムは無し（個人プロジェクトのため）

## 現在の対策

- `npm audit` を CI で二段実行（ci.yml で critical 警告、security.yml で high ブロッキング + 週次スケジュール）
- Dependabot で依存を weekly 更新
- OIDC trusted publishing + `--provenance` で改ざん検出を可能化
- `files` allowlist で不要ファイル（`.env*` 等）を tarball から排除
- POST はリトライ無効化で冪等性を保護（`trading-safety.md` 参照）

リポジトリ側のセキュリティ設定（branch protection / 2FA 等）は
[`docs/dev/repo-security.md`](docs/dev/repo-security.md) を参照。
