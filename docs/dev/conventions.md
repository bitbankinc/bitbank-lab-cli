# 表記規約

## CLI 起動形式

- README 本文のコマンド例は **`bitbank <cmd>` 形式に統一**（`./install.sh` 実行済み前提）。
  Quick Start のフォールバック節のみ `npx tsx [--env-file=.env] cli/index.ts <cmd>` を残し、
  未 install ユーザーへの読み替え方法を 1 か所だけ提示する。
- Skill 側 (`.claude/skills/`) も `bitbank <cmd>` で統一。fallback の言及は
  `_shared/references/cli-conventions.md` に一本化。
- 採用理由: Quick Start が既に install.sh 推奨構成、Skill 側との整合、
  `npx bitbank` / `npx tsx ...` の混在を解消し本文を短く保つため。

## 出力の改行・エンコーディング

- **全出力は LF (`\n`) 固定**（`cli/output.ts` / `cli/output-tabular.ts`）。
  Node は Windows でも `process.stdout.write` の `\n` を `\r\n` に変換しないため、
  どのプラットフォームでも LF で出る。意図的な仕様であり、`\r\n` は付けない。
  CSV (`--format=csv`) も LF 固定。現代の Excel / LibreOffice / pandas は
  LF-only CSV を解釈できる（RFC4180 は CRLF 規定だが実害なし）。
- dry-run の human プレビュー (`cli/output-dry-run.ts`) は UTF-8 で日本語＋絵文字
  (`🔍`) を出す。UTF-8 を描画できない旧 cp932 コンソールでは絵文字以前に日本語が
  化けるため、絵文字単体を ASCII 化しても可読性は改善しない。Windows Terminal /
  PowerShell 7 など現行環境では問題なく表示される。
