#!/usr/bin/env bash
set -euo pipefail

: "${BACKUP_DATABASE_URL:?Set the direct database connection}"
: "${BACKUP_SOURCE_ID:?Set the configured source identity}"
: "${BACKUP_SOURCE_COMMIT:?Set the source commit}"
: "${BACKUP_OUTPUT_DIR:?Set the backup output directory}"

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
stem="rgss_full_${timestamp}_${BACKUP_RUN_ID:-local}"
mkdir -p -- "$BACKUP_OUTPUT_DIR"
backup="$BACKUP_OUTPUT_DIR/$stem.dump"
schema="$BACKUP_OUTPUT_DIR/$stem.schema"
facts="$BACKUP_OUTPUT_DIR/$stem.facts.json"
manifest="$BACKUP_OUTPUT_DIR/$stem.manifest.json"

# Keep the exporting transaction open while pg_dump and the manifest query
# import the same snapshot. Neither command modifies the source database.
coproc SNAPSHOT {
  psql -X -qAt -v ON_ERROR_STOP=1 "$BACKUP_DATABASE_URL"
}
snapshot_pid=$SNAPSHOT_PID
snapshot_input=${SNAPSHOT[1]}
snapshot_output=${SNAPSHOT[0]}
cleanup() {
  kill "$snapshot_pid" 2>/dev/null || true
  wait "$snapshot_pid" 2>/dev/null || true
}
trap cleanup EXIT
printf '%s\n' 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;' 'SELECT pg_export_snapshot();' >&"$snapshot_input"
IFS= read -r snapshot <&"$snapshot_output"
[[ "$snapshot" =~ ^[[:xdigit:]]+-[[:xdigit:]]+-[[:digit:]]+$ ]]

pg_dump "$BACKUP_DATABASE_URL" --snapshot="$snapshot" --format=custom \
  --no-owner --no-acl --file="$backup"
pg_dump "$BACKUP_DATABASE_URL" --snapshot="$snapshot" --schema-only \
  --no-owner --no-acl | bash "$script_dir/normalize-schema.sh" > "$schema"
{
  printf "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSET TRANSACTION SNAPSHOT '%s';\n" "$snapshot"
  printf 'SET LOCAL search_path = pg_catalog;\n'
  cat "$script_dir/database-facts.sql"
  printf '\nCOMMIT;\n'
} | psql -X -qAt -v ON_ERROR_STOP=1 "$BACKUP_DATABASE_URL" > "$facts"

printf '%s\n' 'ROLLBACK;' '\q' >&"$snapshot_input"
wait "$snapshot_pid"
trap - EXIT

jq -e '(.counts | length) > 0 and (.drizzleLedger | type == "array")' "$facts" >/dev/null
pg_restore --list "$backup" >/dev/null
dump_sha=$(sha256sum "$backup" | cut -d ' ' -f1)
schema_sha=$(sha256sum "$schema" | cut -d ' ' -f1)
jq -n --arg key "weekly/$stem.dump" \
  --arg createdAt "$(date -u +%FT%TZ)" --arg sourceId "$BACKUP_SOURCE_ID" \
  --arg sourceCommit "$BACKUP_SOURCE_COMMIT" \
  --arg dumpSha256 "$dump_sha" --arg schemaSha256 "$schema_sha" \
  --slurpfile facts "$facts" \
  '{version: 1, key: $key, createdAt: $createdAt, sourceId: $sourceId,
    sourceCommit: $sourceCommit, dumpSha256: $dumpSha256, schemaSha256: $schemaSha256,
    facts: $facts[0]}' > "$manifest"
printf '%s\n' "$stem"
