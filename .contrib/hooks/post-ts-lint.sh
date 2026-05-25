#!/usr/bin/env bash
# 目的: TS ファイル編集後に自動で lint + 型チェックを実行し、
# 違反を additionalContext で AI にフィードバックする

file_path="${CLAUDE_FILE_PATH:-}"

# TS ファイル以外は無視
if [[ "$file_path" != *.ts ]]; then
  exit 0
fi

errors=""

# Biome check
lint_output=$(npx biome check "$file_path" 2>&1)
if [ $? -ne 0 ]; then
  errors+="## Biome lint errors\n$lint_output\n\n"
fi

# banned patterns: throw（テストファイル除外）
if [[ "$file_path" != *"__tests__"* ]]; then
  throw_check=$(grep -n '^\s*throw ' "$file_path" 2>/dev/null)
  if [ -n "$throw_check" ]; then
    errors+="## Banned pattern: throw\n$throw_check\nResult パターンを使うこと\n\n"
  fi
fi

if [ -n "$errors" ]; then
  echo -e "$errors"
  exit 2
fi

exit 0
