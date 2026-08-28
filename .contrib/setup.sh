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

# gitleaks の導入確認。pre-commit の秘密情報スキャンが使う（lefthook.yml）。
# 未導入でも commit 自体は通る（警告のみ）ので、ここは案内に留めて失敗させない。
# なお lefthook のフック配線は npm install の副作用で入るため、この setup.sh を
# 実行しなかった人にはこの案内は届かない。あくまで補助。
echo ""
if command -v gitleaks >/dev/null 2>&1; then
  echo "✅ gitleaks: $(gitleaks version 2>/dev/null || echo 'installed')"
else
  echo "⚠️  gitleaks が見つかりません。pre-commit の秘密情報スキャンが効きません。"
  echo "    install: brew install gitleaks  /  https://github.com/gitleaks/gitleaks#installing"
  echo "    未導入を commit エラーにしたい場合は LEFTHOOK_REQUIRE_GITLEAKS=1 を設定してください。"
fi

echo ""
echo "✅ 開発者用 hook と settings をリンクしました。"
echo "   .claude/settings.json / .claude/hooks/ / .cursorrules は .gitignore 済みです。"
