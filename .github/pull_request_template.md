# 概要

<!-- 目的・変更概要を記載。関連 Issue があれば #番号 で参照 -->

## チェックリスト

- [ ] 目的 / 変更概要を記載した
- [ ] テストを追加・更新した
- [ ] `npx vitest run` が green
- [ ] `npx tsc --noEmit` が green
- [ ] `npx biome check cli/` が green
- [ ] chaos 規約（`cli/__tests__/chaos/conventions/`）・1 ファイル 100 行目安を満たす
- [ ] シークレット（API キー / secret 等）を含めていない（trade 変更時は `.claude/rules/trading-safety.md` を遵守）
- [ ] 必要ならドキュメントを更新した

<!-- 開発規約・品質ゲートの詳細はリポジトリ root の CONTRIBUTING.md を参照 -->
