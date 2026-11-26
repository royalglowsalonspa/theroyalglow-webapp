#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${BACKUP_DATABASE_URL:?Set the direct database connection}"
: "${BACKUP_SOURCE_ID:?Set the configured source identity}"
: "${BACKUP_SOURCE_COMMIT:?Set the source commit}"
: "${BACKUP_OUTPUT_DIR:?Set the backup output directory}"

key_prefix=${BACKUP_KEY_PREFIX:-weekly}
release_metadata='{}'
case "$key_prefix" in
  weekly) ;;
  release)
    : "${BACKUP_RELEASE_CANDIDATE_COMMIT:?Set the full release candidate commit SHA}"
    : "${BACKUP_SOURCE_DEPLOYED_COMMIT:?Set the reviewed currently deployed AWS commit SHA}"
    : "${BACKUP_SOURCE_NEON_HOST:?Set the reviewed direct Neon production hostname}"
    : "${BACKUP_SOURCE_NEON_BRANCH_ID:?Set the reviewed Neon production branch ID}"
    [[ "$BACKUP_RELEASE_CANDIDATE_COMMIT" =~ ^[0-9a-f]{40}$ &&
       "$BACKUP_SOURCE_DEPLOYED_COMMIT" =~ ^[0-9a-f]{40}$ &&
       "$BACKUP_SOURCE_NEON_BRANCH_ID" =~ ^br-[a-z0-9-]+$ ]]
    node --input-type=module - <<'JS'
    let source
    try {
      source = new URL(process.env.BACKUP_DATABASE_URL)
    } catch {
      // The same validation error covers malformed or misdirected URLs.
    }
    const host = process.env.BACKUP_SOURCE_NEON_HOST
    if (
      !source ||
      !['postgresql:', 'postgres:'].includes(source.protocol) ||
      source.hostname !== host ||
      !/^ep-[a-z0-9-]+(?:\.[a-z0-9-]+)+\.neon\.tech$/.test(host) ||
      host.split('.')[0].endsWith('-pooler') ||
      source.searchParams.has('host') ||
      source.searchParams.has('hostaddr') ||
      process.env.PGHOSTADDR
    ) {
      console.error('Release backup must use the reviewed direct Neon host.')
      process.exitCode = 1
    }
JS
    release_metadata=$(jq -n --arg candidate "$BACKUP_RELEASE_CANDIDATE_COMMIT" \
      --arg deployed "$BACKUP_SOURCE_DEPLOYED_COMMIT" --arg host "$BACKUP_SOURCE_NEON_HOST" \
      --arg branch "$BACKUP_SOURCE_NEON_BRANCH_ID" \
      '{releaseCandidateCommit: $candidate, sourceDeployedCommit: $deployed,
        sourceNeonHost: $host, sourceNeonBranchId: $branch}')
    ;;
  *) echo 'Backup purpose must be weekly or release.' >&2; exit 2 ;;
esac

capture_assets=${BACKUP_CAPTURE_ASSETS:-false}
if [[ "$capture_assets" != false && ( "$capture_assets" != true || "$key_prefix" != release ) ]]; then
  echo 'Asset capture requires a release backup.' >&2
  exit 2
fi

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
  exec psql -X -qAt -v ON_ERROR_STOP=1 "$BACKUP_DATABASE_URL"
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
snapshot=${snapshot%$'\r'}
[[ "$snapshot" =~ ^[[:xdigit:]]+-[[:xdigit:]]+-[[:digit:]]+$ ]]

pg_dump "$BACKUP_DATABASE_URL" --snapshot="$snapshot" --format=custom \
  --no-owner --no-acl --file="$backup"
pg_dump "$BACKUP_DATABASE_URL" --snapshot="$snapshot" --schema-only \
  --no-owner --no-acl | bash "$script_dir/normalize-schema.sh" > "$schema"
read_snapshot_facts() {
  {
    printf "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSET TRANSACTION SNAPSHOT '%s';\n" "$snapshot"
    printf "SET LOCAL search_path = pg_catalog;\nSET LOCAL TIME ZONE 'UTC';\n"
    cat "$script_dir/database-facts.sql"
    printf '\nCOMMIT;\n'
  } | psql -X -qAt -v ON_ERROR_STOP=1 "$@" "$BACKUP_DATABASE_URL"
}
read_snapshot_facts > "$facts"
if [[ "$capture_assets" == true ]]; then
  read_snapshot_facts -v rgss_backup_reference_export=true > "$BACKUP_OUTPUT_DIR/$stem.references.json"
fi

printf '%s\n' 'ROLLBACK;' '\q' >&"$snapshot_input"
wait "$snapshot_pid"
trap - EXIT

jq -e '(.counts | length) > 0 and (.drizzleLedger | type == "array")' "$facts" >/dev/null
pg_restore --list "$backup" >/dev/null
dump_sha=$(sha256sum "$backup" | cut -d ' ' -f1)
schema_sha=$(sha256sum "$schema" | cut -d ' ' -f1)
jq -n --arg key "$key_prefix/$stem.dump" \
  --arg createdAt "$(date -u +%FT%TZ)" --arg sourceId "$BACKUP_SOURCE_ID" \
  --arg sourceCommit "$BACKUP_SOURCE_COMMIT" \
  --arg dumpSha256 "$dump_sha" --arg schemaSha256 "$schema_sha" \
  --argjson release "$release_metadata" \
  --slurpfile facts "$facts" \
  '{version: 1, key: $key, createdAt: $createdAt, sourceId: $sourceId,
    sourceCommit: $sourceCommit, dumpSha256: $dumpSha256, schemaSha256: $schemaSha256,
    facts: $facts[0]} + $release' > "$manifest"
printf '%s\n' "$stem"
