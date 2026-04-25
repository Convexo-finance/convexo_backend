#!/usr/bin/env bash
# Pre-deploy checklist — run before `railway up`
set -e

echo "=== Pre-deploy checks ==="

# 1. Confirm railway service
SERVICE=$(railway status 2>/dev/null | grep "Service:" | awk '{print $2}')
if [ "$SERVICE" != "convexo-api" ]; then
  echo "ERROR: Railway service is '$SERVICE', expected 'convexo-api'"
  echo "Run: railway service link \"convexo-api\""
  exit 1
fi
echo "✓ Railway service: $SERVICE"

# 2. TypeScript build
echo "Running TypeScript build..."
npm run build --silent
echo "✓ Build passed"

# 3. Check for uncommitted migrations
UNCOMMITTED=$(git status --porcelain prisma/migrations/ 2>/dev/null)
if [ -n "$UNCOMMITTED" ]; then
  echo "WARNING: Uncommitted migration files detected:"
  echo "$UNCOMMITTED"
  echo "Commit migrations before deploying or they won't be applied."
  read -p "Continue anyway? [y/N] " confirm
  if [ "$confirm" != "y" ]; then exit 1; fi
fi
echo "✓ Migrations committed"

echo "=== All checks passed. Running railway up ==="
