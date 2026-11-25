#!/usr/bin/env bash
set -euo pipefail
umask 077

cd "${GITHUB_WORKSPACE:?}"
postgres_bin=/usr/lib/postgresql/18/bin
cluster_dir=$(mktemp -d "${RUNNER_TEMP:?}/rgss-synthetic-postgres.XXXXXXXX")
port=15432
database=rgss_rehearsal_ci
role=rgss_ci
password=$(openssl rand -hex 24)
password_file="$cluster_dir/password"
printf '%s\n' "$password" > "$password_file"

"$postgres_bin/initdb" -D "$cluster_dir/data" --username="$role" \
  --pwfile="$password_file" --auth-host=scram-sha-256 --auth-local=peer \
  --locale=C --encoding=UTF8 >/dev/null
rm -- "$password_file"
"$postgres_bin/pg_ctl" -D "$cluster_dir/data" -l "$cluster_dir/server.log" \
  -o "-h 127.0.0.1 -p $port -k $cluster_dir -c timezone=UTC" -w start

export PGPASSWORD="$password"
"$postgres_bin/createdb" -h 127.0.0.1 -p "$port" -U "$role" "$database"
unset PGPASSWORD

export DATABASE_URL="postgresql://$role:$password@127.0.0.1:$port/$database"
export DATABASE_URL_UNPOOLED="$DATABASE_URL"
export REHEARSAL_DATABASE_URL="$DATABASE_URL"
export REHEARSAL_PG_DATA="$cluster_dir/data"
export RGSS_LOCAL_DB_PRELOAD="$GITHUB_WORKSPACE/scripts/release/preload-local-rehearsal-db.mjs"
export PAYLOAD_SECRET
export BETTER_AUTH_SECRET
PAYLOAD_SECRET=$(openssl rand -hex 32)
BETTER_AUTH_SECRET=$(openssl rand -hex 32)
export BETTER_AUTH_URL=http://localhost:3000
export NEXT_PUBLIC_APP_URL="$BETTER_AUTH_URL"
export PAYLOAD_PUBLIC_SERVER_URL=http://127.0.0.1:3002
export APP_ENV=test
export SKIP_ENV_VALIDATION=1

printf '::add-mask::%s\n' "$password" "$DATABASE_URL" "$PAYLOAD_SECRET" "$BETTER_AUTH_SECRET"

bun run migrate
SERVICE_SYNC_ENABLED=false bun run --filter=@rgss/cms migrate
"$postgres_bin/psql" -X -v ON_ERROR_STOP=1 "$DATABASE_URL" \
  -f packages/db/scripts/seed-multi-branch-rehearsal.sql
bun run apps/cms/scripts/seed-multi-branch-rehearsal.ts
"$postgres_bin/psql" -X -v ON_ERROR_STOP=1 "$DATABASE_URL" \
  -f packages/db/scripts/seed-multi-branch-rehearsal.sql

{
  printf 'DATABASE_URL=%s\n' "$DATABASE_URL"
  printf 'DATABASE_URL_UNPOOLED=%s\n' "$DATABASE_URL_UNPOOLED"
  printf 'REHEARSAL_PG_DATA=%s\n' "$REHEARSAL_PG_DATA"
  printf 'RGSS_LOCAL_DB_PRELOAD=%s\n' "$RGSS_LOCAL_DB_PRELOAD"
  printf 'PAYLOAD_SECRET=%s\n' "$PAYLOAD_SECRET"
  printf 'PAYLOAD_PUBLIC_SERVER_URL=%s\n' "$PAYLOAD_PUBLIC_SERVER_URL"
  printf 'BETTER_AUTH_SECRET=%s\n' "$BETTER_AUTH_SECRET"
  printf 'BETTER_AUTH_URL=%s\n' "$BETTER_AUTH_URL"
  printf 'NEXT_PUBLIC_APP_URL=%s\n' "$NEXT_PUBLIC_APP_URL"
  printf 'APP_ENV=%s\n' "$APP_ENV"
  printf 'SKIP_ENV_VALIDATION=%s\n' "$SKIP_ENV_VALIDATION"
} >> "${GITHUB_ENV:?}"
