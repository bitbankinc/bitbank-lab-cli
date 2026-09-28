# docs/dev

メンテナ用の開発資料置き場。配布物としての参照は期待していない。
clone したユーザーは基本的に読む必要はない。

## 中身

- `phases.md` — 開発フェーズの履歴と TODO
- `conventions.md` — メンテナ向けのコード規約メモ
- `release.md` — リリース手順（tag push → release.yml で version 注入・publish）
- `repo-security.md` — GitHub / npm の管理者向け初期セットアップ
- `nl-verification.md` — 自然言語 E2E 検証の手順（skill 経由の起動・規律・安全ガード）
- `tax-*.md` — Phase 6（税務・会計データ整形）の計画・要求仕様・調査・設計メモ
- `margin-order-plan.md` — Phase 7（信用の新規建て・返済注文）の開発計画

配布側ユーザーが参照すべきドキュメントは `docs/customization-guide.md` /
`docs/skill-workflow.md` / `docs/adr/` 側にある。
