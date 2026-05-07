#!/usr/bin/env bash
# 目的: コード変更時にテストを実行し、壊れていないことを保証する
# ループ防止: .ts/.js ファイルに変更がなければスキップ

if git diff --quiet HEAD -- '*.ts' '*.js' 2>/dev/null && \
   [ -z "$(git ls-files --others --exclude-standard '*.ts' '*.js' 2>/dev/null)" ]; then
  # コード変更なし → テスト不要
  exit 0
fi

output=$(npx vitest run 2>&1)
exit_code=$?

if [ $exit_code -ne 0 ]; then
  echo "❌ テストが失敗しています。修正してからセッションを終了してください。"
  echo "$output"
  exit 2
fi

# 成功時は何も出力しない（フィードバックループ防止）
exit 0
