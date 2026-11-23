#!/usr/bin/env bash
set -euo pipefail

helper=$(dirname -- "$0")/verify-r2-backup-access.sh
fixture=$(mktemp -d)
trap 'rm -f -- "$fixture/aws" "$fixture/call" "$fixture/github-env" "$fixture/stderr"; rmdir -- "$fixture"' EXIT

cat > "$fixture/aws" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$@" > "$AWS_TEST_CALL"
exit "$AWS_TEST_STATUS"
SH
chmod +x "$fixture/aws"

export PATH="$fixture:$PATH"
export AWS_TEST_CALL="$fixture/call"
export AWS_TEST_STATUS=0
export GITHUB_ENV="$fixture/github-env"
export R2_BACKUP_ACCOUNT_ID=0123456789abcdef0123456789abcdef
export AWS_ACCESS_KEY_ID=fixture-backup-key
export AWS_SECRET_ACCESS_KEY=fixture-backup-secret

expect_failure() {
  local expected=$1
  shift
  if env "$@" bash "$helper" 2> "$fixture/stderr"; then
    echo "Expected failure: $expected" >&2
    exit 1
  fi
  grep -Fq "$expected" "$fixture/stderr"
  ! grep -Fq "$AWS_SECRET_ACCESS_KEY" "$fixture/stderr"
  [[ ! -e "$GITHUB_ENV" ]]
}

expect_failure 'Invalid backup account' R2_BACKUP_ACCOUNT_ID='media.example.invalid'
expect_failure 'Missing backup credentials' AWS_ACCESS_KEY_ID=''
expect_failure 'Missing backup credentials' AWS_SECRET_ACCESS_KEY=''
[[ ! -e "$AWS_TEST_CALL" ]]
expect_failure 'Backup bucket unavailable' AWS_TEST_STATUS=1

bash "$helper"
endpoint="https://${R2_BACKUP_ACCOUNT_ID}.r2.cloudflarestorage.com"
expected_call=$(printf '%s\n' s3api list-objects-v2 --bucket rgss-backups --prefix weekly/ \
  --max-keys 1 --no-paginate --endpoint-url "$endpoint")
[[ $(cat "$AWS_TEST_CALL") == "$expected_call" ]]
expected_environment=$(printf 'R2_BACKUP_BUCKET=rgss-backups\nR2_BACKUP_ENDPOINT=%s\n' "$endpoint")
[[ $(cat "$GITHUB_ENV") == "$expected_environment" ]]

echo 'R2 backup preflight passed for valid, missing, malformed, and denied inputs.'
