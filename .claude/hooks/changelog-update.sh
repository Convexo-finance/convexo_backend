#!/usr/bin/env bash
# Reminds to update CHANGELOG.md when significant changes are staged.
# Run as a pre-commit hook or manually after finishing a feature.

STAGED=$(git diff --cached --name-only 2>/dev/null)

if echo "$STAGED" | grep -qE "^src/modules/|^prisma/schema\.prisma"; then
  if ! echo "$STAGED" | grep -q "CHANGELOG.md"; then
    echo ""
    echo "⚠️  CHANGELOG.md not staged."
    echo "   You modified source files or the schema — consider adding a changelog entry."
    echo "   CHANGELOG.md format: ## [vX.Y] — $(date +%Y-%m-%d)"
    echo ""
  fi
fi
