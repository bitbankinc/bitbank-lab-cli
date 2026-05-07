#!/usr/bin/env bash
# 目的: AI が設定ファイルを緩める方向に変更するのを防止する
# biome.json, tsconfig.json, lefthook.yml, package.json, ci.yml への
# Edit/Write を遮断し、人間のレビューを強制する

PROTECTED_FILES="biome.json tsconfig.json lefthook.yml .github/workflows/ci.yml"

file_path="${CLAUDE_FILE_PATH:-}"

for protected in $PROTECTED_FILES; do
  if [[ "$file_path" == *"$protected" ]]; then
    echo "BLOCKED: $protected は保護対象ファイルです。手動で編集してください。"
    exit 2
  fi
done

exit 0
