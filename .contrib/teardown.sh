#!/usr/bin/env bash
# 開発者向け: .contrib/setup.sh で張った symlink を全部外す
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

rm -f .claude/settings.json
rm -f .claude/hooks/*.sh
rmdir .claude/hooks 2>/dev/null || true
rm -f .cursorrules
echo "✅ symlink を解除しました。"
