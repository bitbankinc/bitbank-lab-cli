# 表記規約

## CLI 起動形式

- README 本文のコマンド例は **`bitbank <cmd>` 形式に統一**（`./install.sh` 実行済み前提）。
  Quick Start のフォールバック節のみ `npx tsx [--env-file=.env] cli/index.ts <cmd>` を残し、
  未 install ユーザーへの読み替え方法を 1 か所だけ提示する。
- Skill 側 (`.claude/skills/`) も `bitbank <cmd>` で統一。fallback の言及は
  `_shared/references/cli-conventions.md` に一本化。
- 採用理由: Quick Start が既に install.sh 推奨構成、Skill 側との整合、
  `npx bitbank` / `npx tsx ...` の混在を解消し本文を短く保つため。
