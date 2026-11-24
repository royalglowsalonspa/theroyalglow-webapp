#!/usr/bin/env bash
set -euo pipefail

# The account is configuration. The S3 keys belong to the backup bucket only.
if [[ ! "${R2_BACKUP_ACCOUNT_ID:-}" =~ ^[a-f0-9]{32}$ ]]; then
  echo '::error title=Invalid backup account::Set the R2_BACKUP_ACCOUNT_ID Actions variable to the 32-character Cloudflare account ID.' >&2
  exit 1
fi
if [[ -z "${AWS_ACCESS_KEY_ID:-}" || -z "${AWS_SECRET_ACCESS_KEY:-}" ]]; then
  echo '::error title=Missing backup credentials::Configure the dedicated R2 backup access key and secret for this workflow.' >&2
  exit 1
fi
: "${GITHUB_ENV:?GitHub Actions environment file required}"

bucket=rgss-backups
endpoint="https://${R2_BACKUP_ACCOUNT_ID}.r2.cloudflarestorage.com"
if ! aws s3api list-objects-v2 --bucket "$bucket" --prefix weekly/ --max-keys 1 \
  --no-paginate --endpoint-url "$endpoint" >/dev/null 2>&1; then
  echo '::error title=Backup bucket unavailable::Check the Cloudflare backup account, the private rgss-backups bucket, and the scope of this workflow’s R2 credentials.' >&2
  exit 1
fi

{
  printf 'R2_BACKUP_BUCKET=%s\n' "$bucket"
  printf 'R2_BACKUP_ENDPOINT=%s\n' "$endpoint"
} >> "$GITHUB_ENV"
