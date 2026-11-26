#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ $# -ne 3 ]]; then
  echo 'Usage: verify-candidate-replay.sh <isolated-container-id> <release-manifest> <candidate-checkout>' >&2
  exit 2
fi

fail() {
  echo "$1" >&2
  exit 1
}

container=$1
[[ "$container" =~ ^[0-9a-f]{64}$ ]] || fail 'An exact isolated container ID is required.'
manifest=$(realpath -- "$2")
checkout=$(cd -- "$3" && pwd -P)
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
reviewed_allowlist=${BACKUP_REVIEWED_CLEANUP_ALLOWLIST:-}
private_report=${BACKUP_CLEANUP_PREVIEW_REPORT:-}
[[ -z "$private_report" || -n "$reviewed_allowlist" ]] || fail 'A cleanup report requires a reviewed allowlist.'
if [[ -n "$reviewed_allowlist" ]]; then reviewed_allowlist=$(realpath -- "$reviewed_allowlist"); fi

candidate=$(jq -er 'select(.version == 1 and
  (.key | test("^release/rgss_full_[0-9]{8}T[0-9]{6}Z_[0-9]+-[0-9]+[.]dump$"))) |
  .releaseCandidateCommit | select(type == "string" and test("^[0-9a-f]{40}$"))' "$manifest") ||
  fail 'A candidate-bound release manifest is required.'
[[ $(git -C "$checkout" rev-parse --show-toplevel) == "$checkout" &&
   $(git -C "$checkout" rev-parse HEAD) == "$candidate" ]] ||
  fail 'The candidate checkout does not match the release manifest.'
git -C "$checkout" diff --quiet HEAD -- || fail 'The candidate checkout has tracked changes.'
[[ -d "$checkout/node_modules" ]] || fail 'Install the candidate lockfile before verifying replay.'
# Payload loads dotenv files itself even when Bun's automatic loading is off.
for directory in "$checkout" "$checkout/apps" "$checkout/apps/cms" "$checkout/packages/db"; do
  for env_file in .env .env.local .env.{production,development,test}{,.local}; do
    [[ ! -e "$directory/$env_file" && ! -L "$directory/$env_file" ]] ||
      fail 'Use a fresh candidate checkout without environment files for quarantined replay.'
  done
done

node_path=$(realpath -- "$(command -v node)")
bun_path=$(realpath -- "$(command -v bun)")
node_version=$(tr -d '\r\n' < "$checkout/.node-version")
bun_version=$(jq -er '.packageManager | capture("^bun@(?<version>[0-9]+[.][0-9]+[.][0-9]+)$").version' "$checkout/package.json")
[[ "$("$node_path" --version)" == "v$node_version" && "$("$bun_path" --version)" == "$bun_version" ]] ||
  fail 'Use the Node.js and Bun versions pinned by the candidate checkout.'

for path in "$manifest" "$checkout" "$script_dir" "$node_path" "$bun_path" "$reviewed_allowlist"; do
  [[ "$path" != *','* && "$path" != *$'\n'* && "$path" != *$'\r'* ]] || fail 'Unsupported mount path.'
done

container_state=$(docker inspect --type container --format \
  '{{.State.Running}} {{.HostConfig.NetworkMode}} {{len .HostConfig.PortBindings}} {{.Image}}' "$container")
read -r running network published image extra <<< "$container_state"
[[ "$running" == true && "$network" == none && "$published" == 0 &&
   "$image" =~ ^sha256:[0-9a-f]{64}$ && -z "$extra" ]] ||
  fail 'Candidate replay requires a running container with no external network or published ports.'
attached=$(docker inspect --type container --format \
  '{{range $name, $network := .NetworkSettings.Networks}}{{$name}}{{println}}{{end}}' "$container")
[[ -z "$attached" || "$attached" == none ]] || fail 'The restore container has an attached network.'

scratch=$(mktemp -d)
cleanup() {
  local result=$?
  if ! rm -f -- "$scratch/"{expected-drizzle,expected-cms,before.json,first.json,second.json,first.sql,second.sql,commands.log,cleanup.json} ||
     ! rmdir -- "$scratch"; then
    echo 'Could not remove the private migration replay scratch files.' >&2
    result=1
  fi
  exit "$result"
}
trap cleanup EXIT
db_url='postgresql://postgres@127.0.0.1:5432/restore_check?sslmode=disable'

pg() {
  docker exec -i "$container" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d restore_check "$@"
}

facts() {
  {
    printf "BEGIN READ ONLY;\nSET LOCAL search_path = pg_catalog;\nSET LOCAL TIME ZONE 'UTC';\n"
    cat "$script_dir/database-facts.sql"
    printf '\nCOMMIT;\n'
  } | pg | jq -S 'del(.database)'
}

schema() {
  docker exec "$container" pg_dump -U postgres -d restore_check --schema-only \
    --no-owner --no-acl | bash "$script_dir/normalize-schema.sh"
}

# Recheck the original facts and schema before any candidate DDL. This prevents
# replay on an unrelated database in a different disconnected container.
facts > "$scratch/before.json"
if ! jq -e --slurpfile actual "$scratch/before.json" '(.facts | del(.database)) == $actual[0]' \
  "$manifest" >/dev/null ||
   [[ $(schema | sha256sum | cut -d ' ' -f1) != "$(jq -r '.schemaSha256' "$manifest")" ]]; then
  fail 'The isolated database does not match the selected release manifest.'
fi

journal="$checkout/packages/db/migrations/meta/_journal.json"
jq -e '.entries | length > 0 and all(.[];
  (.when | type == "number" and . > 0 and . == floor) and
  (.tag | test("^[a-zA-Z0-9_]+$")))' "$journal" >/dev/null
jq -r '.entries[] | [.when, .tag] | @tsv' "$journal" | while IFS=$'\t' read -r when tag; do
  hash=$(sha256sum "$checkout/packages/db/migrations/$tag.sql" | cut -d ' ' -f1)
  jq -n --arg when "$when" --arg hash "$hash" '{when: $when, hash: $hash}'
done | jq -s '.' > "$scratch/expected-drizzle"
sed -nE "s/^[[:space:]]*name:[[:space:]]*'([a-zA-Z0-9_]+)'[[:space:]]*,?[[:space:]]*$/\1/p" \
  "$checkout/apps/cms/src/migrations/index.ts" | jq -R . | jq -s '.' > "$scratch/expected-cms"
jq -e 'length > 0' "$scratch/expected-cms" >/dev/null

check_ledgers() {
  local facts_path=$1 mode=$2
  jq -e --arg mode "$mode" --slurpfile drizzle "$scratch/expected-drizzle" \
    --slurpfile cms "$scratch/expected-cms" '
    [(.drizzleLedger // [])[] | {when: (.created_at | tostring), hash}] as $actualDrizzle |
    [(.payloadLedger // [])[].name] as $actualCMS |
    if $mode == "prefix" then
      $actualDrizzle == $drizzle[0][0:($actualDrizzle | length)] and
      $actualCMS == $cms[0][0:($actualCMS | length)]
    else
      $actualDrizzle == $drizzle[0] and $actualCMS == $cms[0]
    end
  ' "$facts_path" >/dev/null
}
check_ledgers "$scratch/before.json" prefix || fail 'The restored ledgers are out of order or differ from the candidate history.'

legacy_drop='20260729_182023_drop_legacy_service_collection'
if jq -e --arg migration "$legacy_drop" 'index($migration) != null' "$scratch/expected-cms" >/dev/null &&
   ! jq -e --arg migration "$legacy_drop" 'any((.payloadLedger // [])[]; .name == $migration)' "$scratch/before.json" >/dev/null; then
  legacy_service_exists=$(pg -c "SELECT to_regclass('cms.service') IS NOT NULL")
  if [[ "$legacy_service_exists" == t ]]; then
    legacy_service_has_rows=$(pg -c 'SELECT EXISTS (SELECT 1 FROM cms.service)')
    [[ "$legacy_service_has_rows" == f ]] ||
      fail 'The legacy CMS service table contains data. Review the catalogue recovery before replaying its drop migration.'
  fi
fi

sidecar=(
  docker run --rm --network "container:$container" --read-only --tmpfs /tmp
  --user "$(id -u):$(id -g)" --cap-drop ALL --security-opt no-new-privileges
  --mount "type=bind,source=$checkout,target=/candidate,readonly"
  --mount "type=bind,source=$node_path,target=/usr/local/bin/node,readonly"
  --mount "type=bind,source=$bun_path,target=/usr/local/bin/bun,readonly"
  --env HOME=/tmp --env DATABASE_URL="$db_url" --env DATABASE_URL_UNPOOLED="$db_url"
  --env NODE_ENV=production --env SERVICE_SYNC_ENABLED=false --env PAYLOAD_SECRET=isolated-candidate-restore-only
  --env PAYLOAD_PUBLIC_SERVER_URL=http://127.0.0.1:3002
  --env PAYLOAD_TELEMETRY_DISABLED=true --env BUN_RUNTIME_TRANSPILER_CACHE_PATH=0
  --workdir /candidate --entrypoint /bin/bash
)

replay() {
  if ! "${sidecar[@]}" "$image" -euc '
    cd /candidate/packages/db
    bun --no-env-file run migrate
    cd /candidate/apps/cms
    bun --no-env-file run migrate
  ' > "$scratch/commands.log" 2>&1; then
    fail 'Candidate forward migrations failed. Diagnostics may contain restored records and were withheld.'
  fi
}

replay
facts > "$scratch/first.json"
schema > "$scratch/first.sql"
check_ledgers "$scratch/first.json" exact || fail 'The forward migrations did not reach the exact candidate ledgers.'
replay
facts > "$scratch/second.json"
schema > "$scratch/second.sql"
if ! cmp -s "$scratch/first.json" "$scratch/second.json" ||
   ! cmp -s "$scratch/first.sql" "$scratch/second.sql"; then
  fail 'Replaying the candidate changed restored facts or schema on the second run.'
fi
echo 'Candidate Drizzle and Payload migrations reached their exact ledgers and replayed without changes.'

if [[ -n "$reviewed_allowlist" ]]; then
  status=0
  "${sidecar[@]}" \
    --mount "type=bind,source=$script_dir,target=/restore-tools,readonly" \
    --mount "type=bind,source=$manifest,target=/restore-manifest.json,readonly" \
    --mount "type=bind,source=$reviewed_allowlist,target=/restore-allowlist.json,readonly" \
    --env CLEANUP_PREVIEW_DATABASE_URL="$db_url" \
    "$image" -euc 'bun --no-env-file /restore-tools/preview-cleanup.mjs /restore-allowlist.json /restore-manifest.json' \
    > "$scratch/cleanup.json" 2> "$scratch/commands.log" || status=$?
  if [[ -n "$private_report" && -s "$scratch/cleanup.json" ]]; then
    (set -o noclobber; cat "$scratch/cleanup.json" > "$private_report") ||
      fail 'Could not write the private cleanup report without overwriting an existing file.'
  fi
  [[ "$status" == 0 ]] || fail 'The reviewed cleanup preview did not pass on the migrated restore.'
  jq -e '.status == "database_review_complete"' "$scratch/cleanup.json" >/dev/null ||
    fail 'The cleanup preview did not produce complete database evidence.'
  echo 'The reviewed cleanup allowlist passed the read-only database preview on the migrated restore.'
else
  echo 'Cleanup preview awaits the reviewed exact-ID allowlist for this backup.'
fi
