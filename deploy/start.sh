#!/bin/sh
# Starts the API and the web app; stops the container if either exits.
set -e
cd /app/server

: "${MONGODB_URI:?Set MONGODB_URI to your MongoDB Atlas connection string}"
export PORT_API=5000

# One-time setup, safe to repeat: indexes, the admin account and (optionally)
# sample data when the database has no schools yet.
node scripts/db-maintenance.js
if [ -n "$ADMIN_PASSWORD" ]; then
  EDUPRO_ADMIN_PASSWORD="$ADMIN_PASSWORD" node scripts/create-admin.js "${ADMIN_USERNAME:-admin}" "School Admin" || true
fi
if [ "$SEED_DEMO_DATA" = "true" ]; then
  node scripts/seed.js --force || echo "Sample data already present; skipping."
fi

PORT=$PORT_API node src/server.js &
API=$!
cd /app/client
node node_modules/next/dist/bin/next start -p "${PORT:-3000}" &
WEB=$!

trap 'kill -TERM $API $WEB 2>/dev/null' TERM INT
# Exit (so the platform restarts us) if either process dies.
while kill -0 $API 2>/dev/null && kill -0 $WEB 2>/dev/null; do sleep 5; done
kill -TERM $API $WEB 2>/dev/null || true
exit 1
