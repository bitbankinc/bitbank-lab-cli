#!/usr/bin/env bash
# 開発者向け: .contrib/ 配下の hook と settings を .claude/ にリンクする
# クローン者は実行不要。コントリビューターだけが叩く。

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

mkdir -p .claude/hooks
for hook in .contrib/hooks/*.sh; do
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
ln -s "../.contrib/claude-settings.json" "$target"
echo "linked: $target -> .contrib/claude-settings.json"

# .cursorrules を symlink で復元
target=".cursorrules"
if [ -L "$target" ] || [ -e "$target" ]; then
  rm -f "$target"
fi
ln -s ".contrib/cursorrules" "$target"
echo "linked: $target -> .contrib/cursorrules"

echo ""
echo "✅ 開発者用 hook と settings をリンクしました。"
echo "   .claude/settings.json / .claude/hooks/ / .cursorrules は .gitignore 済みです。"
