#!/usr/bin/env bash
# Doctor loyihasini GitHub'ga FORCE push qiladi: lobarabdullayeva92-ui/aiscan (main).
# Ishlatish: bash push.sh ["commit xabari"]
set -euo pipefail
cd "$(dirname "$0")"
git config user.name "lobarabdullayeva92-ui"
git config user.email "310619572+lobarabdullayeva92-ui@users.noreply.github.com"
MSG="${1:-doctor update $(date +%F_%H:%M)}"
git add -A
git commit -m "$MSG" || echo "(o'zgarish yo'q)"
git branch -M main
git push --force origin main
echo "PUSH OK -> origin/main (github.com/lobarabdullayeva92-ui/aiscan)"
