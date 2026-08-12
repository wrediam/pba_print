#!/bin/sh
# Runs on every container start, before the app boots. Every step here
# is safe to run repeatedly -- migrations only apply what's missing, and
# both seed scripts only ever INSERT, never touching existing rows -- so
# redeploying never overwrites data, resets the admin password, or
# duplicates department codes someone has since edited.
set -e

echo "[entrypoint] Running database migrations..."
npm run db:migrate

echo "[entrypoint] Seeding admin account (if one doesn't exist yet)..."
node --experimental-strip-types scripts/seed.ts

echo "[entrypoint] Seeding department codes (if the table is missing any)..."
node --experimental-strip-types scripts/seed-departments.ts

echo "[entrypoint] Starting server..."
exec node build/index.js
