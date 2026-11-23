#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ $# -lt 2 || $# -gt 4 ]]; then
  echo 'Usage: verify-isolated-restore.sh <named-manifest.json> <named-dump> [dump-key] [release-candidate-sha]' >&2
  exit 2
fi

manifest=$1
dump=$2
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
dump_name=$(basename -- "$dump")
expected_key=${3:-weekly/$dump_name}
candidate=${4:-}
if [[ "$expected_key" != "weekly/$dump_name" && "$expected_key" != "release/$dump_name" ]]; then
  echo 'The expected backup key must match the named dump.' >&2
  exit 2
fi
if [[ "$expected_key" == release/* ]]; then
  if [[ ! "$candidate" =~ ^[0-9a-f]{40}$ ]]; then
    echo 'The full reviewed candidate SHA is required to verify a release backup.' >&2
    exit 2
  fi
  jq -e --arg candidate "$candidate" '
    .releaseCandidateCommit == $candidate and
    (.sourceDeployedCommit | test("^[0-9a-f]{40}$")) and
    (.sourceNeonHost | test("^ep-[a-z0-9-]+([.][a-z0-9-]+)+[.]neon[.]tech$")) and
    (.sourceNeonBranchId | test("^br-[a-z0-9-]+$"))
  ' "$manifest" >/dev/null
elif [[ -n "$candidate" ]]; then
  echo 'A release candidate SHA requires a release backup.' >&2
  exit 2
fi
jq -e --arg key "$expected_key" '
  .version == 1 and .key == $key and (.sourceCommit | test("^[0-9a-f]{40}$")) and
  (.dumpSha256 | test("^[0-9a-f]{64}$")) and (.schemaSha256 | test("^[0-9a-f]{64}$")) and
  (.facts.postgresMajor | type == "number") and (.facts.counts | length > 0)
' "$manifest" >/dev/null
expected_dump=$(jq -r '.dumpSha256' "$manifest")
[[ "$(sha256sum "$dump" | cut -d ' ' -f1)" == "$expected_dump" ]]
pg_restore --list "$dump" >/dev/null

started=${SECONDS}
major=$(jq -r '.facts.postgresMajor' "$manifest")
[[ "$major" =~ ^1[6-9]$ ]]
image="postgres:$major-bookworm"
scratch=$(mktemp -d)
container=''
cleanup() {
  local result=$?
  if [[ -n "$container" ]] && ! docker rm -f -v "$container" >/dev/null; then
    echo 'Could not remove the isolated restore container.' >&2
    result=1
  fi
  rm -f -- "$scratch/restored.json" "$scratch/expected.json" "$scratch/schema" "$scratch/restore.log" ||
    result=1
  rmdir -- "$scratch" || result=1
  if [[ "$result" == 0 ]]; then
    echo "Isolated restore verified and removed in $((SECONDS - started)) seconds."
  fi
  exit "$result"
}
trap cleanup EXIT

# Use an empty, unexposed PostgreSQL instance and a Unix socket. It receives
# neither the source URL nor cloud credentials and cannot contact external hosts.
container=$(docker run --detach --network none \
  --env POSTGRES_HOST_AUTH_METHOD=trust "$image")
for (( attempt = 0; attempt < 30; attempt++ )); do
  if docker exec "$container" pg_isready -q -h 127.0.0.1 -U postgres; then break; fi
  sleep 1
done
docker exec "$container" pg_isready -q -h 127.0.0.1 -U postgres
docker exec "$container" createdb -U postgres --template=template0 restore_check
if ! docker exec -i "$container" pg_restore -U postgres --dbname=restore_check \
  --no-owner --no-acl --exit-on-error --single-transaction < "$dump" > "$scratch/restore.log" 2>&1; then
  echo 'PostgreSQL rejected the restore. Diagnostics may contain copied data and were withheld.' >&2
  exit 1
fi

{
  printf "BEGIN READ ONLY;\nSET LOCAL search_path = pg_catalog;\nSET LOCAL TIME ZONE 'UTC';\n"
  cat "$script_dir/database-facts.sql"
  printf '\nCOMMIT;\n'
} | docker exec -i "$container" psql -X -qAt -v ON_ERROR_STOP=1 \
  -U postgres -d restore_check | jq -S 'del(.database)' > "$scratch/restored.json"
jq -S '.facts | del(.database)' "$manifest" > "$scratch/expected.json"
if ! cmp -s "$scratch/expected.json" "$scratch/restored.json"; then
  echo 'Restored counts, amounts, migration ledgers or object references differ from the manifest.' >&2
  exit 1
fi

docker exec "$container" pg_dump -U postgres -d restore_check --schema-only \
  --no-owner --no-acl | bash "$script_dir/normalize-schema.sh" > "$scratch/schema"
if [[ "$(sha256sum "$scratch/schema" | cut -d ' ' -f1)" != "$(jq -r '.schemaSha256' "$manifest")" ]]; then
  echo 'Restored schema differs from the manifest.' >&2
  exit 1
fi
