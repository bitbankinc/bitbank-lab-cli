#!/usr/bin/env bash
# 開発者向け: .dev/ 配下の hook と settings を .claude/ にリンクする
# クローン者は実行不要。コントリビューターだけが叩く。

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

mkdir -p .claude/hooks
for hook in .dev/hooks/*.sh; do
  name=$(basename "$hook")
  target=".claude/hooks/$name"
  if [ -L "$target" ] || [ -e "$target" ]; then
    rm -f "$target"
  fi
  ln -s "../../$hook" "$target"
  echo "linked: $target -> $hook"
done

target=".claude/settings.json"
if [ -L "$target" ] || [ -e "$target" ]; then
  rm -f "$target"
fi
ln -s "../.dev/claude-settings.json" "$target"
echo "linked: $target -> .dev/claude-settings.json"

echo ""
echo "✅ 開発者用 hook と settings をリンクしました。"
echo "   .claude/settings.json と .claude/hooks/ は .gitignore 済みです。"
