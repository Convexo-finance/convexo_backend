#!/bin/sh
set -e

# Run migrations inside the MAIN service container (not Railway preDeploy):
# the preDeploy step has no access to the private network (postgres.railway.internal),
# but the main container does. Retry to absorb the brief private-net startup delay.
echo "Running database migrations (in-container, with retry)..."
i=1
while [ "$i" -le 10 ]; do
  if npx prisma migrate deploy; then
    echo "Migrations applied."
    break
  fi
  if [ "$i" -eq 10 ]; then
    echo "Migrations failed after $i attempts — exiting."
    exit 1
  fi
  echo "migrate attempt $i failed (waiting for DB) — retry in 5s..."
  i=$((i + 1))
  sleep 5
done

echo "Starting server..."
exec node dist/index.js
