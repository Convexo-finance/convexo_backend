#!/usr/bin/env bash
# Run after code changes — quick type check to catch errors early
# Claude Code can invoke this automatically after edits.

echo "=== Type check ==="
npm run build --silent 2>&1 | head -50

if [ $? -eq 0 ]; then
  echo "✓ No TypeScript errors"
else
  echo "✗ TypeScript errors found — fix before deploying"
  exit 1
fi
