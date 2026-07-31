#!/usr/bin/env bash
# =============================================================================
# Register the 15 scheduled jobs on EventBridge Scheduler (M2AWS §11.1)
# -----------------------------------------------------------------------------
# apps/admin/src/lib/jobs/schedules.ts stays the single source of truth for paths
# and crons. This script reads it, so the crons and the route handlers can never
# drift apart — same contract the QStash registration script has today.
#
# Zero application code changes: apps/admin/src/lib/jobs/verify.ts already
# accepts an INTERNAL_JOB_TOKEN header as an alternative to a QStash signature.
# Leave QSTASH_CURRENT_SIGNING_KEY / QSTASH_NEXT_SIGNING_KEY unset and this path
# authenticates instead.
#
# Requires: aws cli v2, bun, jq. Run from the repo root.
#
#   export ADMIN_URL=https://admin.theroyalglow.in
#   export INTERNAL_JOB_TOKEN=<same value as the admin app's env>
#   ./infra/aws/scripts/register-schedules.sh
#
# Idempotent: re-running updates existing schedules in place.
# =============================================================================
set -euo pipefail

PROJECT="${PROJECT:-rgss}"
ENV_NAME="${ENV_NAME:-prod}"
STACK_NAME="${STACK_NAME:-${PROJECT}-${ENV_NAME}-foundation}"
AWS_REGION="${AWS_REGION:-ap-south-1}"
export AWS_DEFAULT_REGION="$AWS_REGION"

GROUP="${PROJECT}-${ENV_NAME}-jobs"
CONNECTION="${PROJECT}-${ENV_NAME}-jobs-conn"
PREFIX="${PROJECT}-${ENV_NAME}"

: "${ADMIN_URL:?set ADMIN_URL, e.g. https://admin.theroyalglow.in}"
: "${INTERNAL_JOB_TOKEN:?set INTERNAL_JOB_TOKEN (must match the admin app env)}"

need() { command -v "$1" >/dev/null || { echo "missing dependency: $1" >&2; exit 1; }; }
need aws; need bun; need jq

# --- Stack outputs -----------------------------------------------------------
outputs=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs' --output json)
out() { jq -r --arg k "$1" '.[] | select(.OutputKey==$k) | .OutputValue' <<<"$outputs"; }

SCHEDULER_ROLE_ARN=$(out SchedulerRoleArn)
DLQ_ARN=$(out JobDlqArn)
[[ -n "$SCHEDULER_ROLE_ARN" && "$SCHEDULER_ROLE_ARN" != null ]] \
  || { echo "SchedulerRoleArn not found in stack $STACK_NAME" >&2; exit 1; }

# --- Read the canonical job list --------------------------------------------
SCHEDULES=$(bun -e '
  import { JOB_SCHEDULES } from "./apps/admin/src/lib/jobs/schedules.ts"
  console.log(JSON.stringify(JOB_SCHEDULES))
')
count=$(jq 'length' <<<"$SCHEDULES")
echo "found $count job schedules in apps/admin/src/lib/jobs/schedules.ts"

# --- Cron translation: 5-field UNIX (QStash) -> 6-field AWS ------------------
# AWS requires exactly one of day-of-month / day-of-week to be '?', and numbers
# day-of-week 1-7 = SUN-SAT, whereas UNIX uses 0-6 = SUN-SAT.
to_aws_cron() {
  read -r min hour dom mon dow <<<"$1"
  if [[ "$dow" == "*" ]]; then
    dow='?'
  else
    dow=$(( ${dow} + 1 ))     # UNIX 0=SUN -> AWS 1=SUN
    [[ "$dom" == "*" ]] && dom='?'
  fi
  echo "cron($min $hour $dom $mon $dow *)"
}

# --- Connection: API key auth carries the shared secret ---------------------
auth_params=$(jq -n --arg t "$INTERNAL_JOB_TOKEN" \
  '{ApiKeyAuthParameters: {ApiKeyName: "x-internal-job-token", ApiKeyValue: $t}}')

if aws events describe-connection --name "$CONNECTION" >/dev/null 2>&1; then
  echo "updating connection $CONNECTION"
  aws events update-connection --name "$CONNECTION" \
    --authorization-type API_KEY \
    --auth-parameters "$auth_params" >/dev/null
else
  echo "creating connection $CONNECTION"
  aws events create-connection --name "$CONNECTION" \
    --authorization-type API_KEY \
    --auth-parameters "$auth_params" >/dev/null
fi

CONNECTION_ARN=$(aws events describe-connection --name "$CONNECTION" \
  --query ConnectionArn --output text)

# --- Schedule group ---------------------------------------------------------
aws scheduler get-schedule-group --name "$GROUP" >/dev/null 2>&1 \
  || { echo "creating schedule group $GROUP"; aws scheduler create-schedule-group --name "$GROUP" >/dev/null; }

# --- One API destination + one schedule per job ------------------------------
for row in $(jq -r '.[] | @base64' <<<"$SCHEDULES"); do
  job=$(base64 -d <<<"$row")
  key=$(jq -r '.key'  <<<"$job")
  path=$(jq -r '.path' <<<"$job")
  cron=$(jq -r '.cron' <<<"$job")
  desc=$(jq -r '.description' <<<"$job")

  dest="${PREFIX}-${key}"
  endpoint="${ADMIN_URL}${path}"
  aws_cron=$(to_aws_cron "$cron")

  # API destination (EventBridge Scheduler cannot call an arbitrary URL directly)
  if aws events describe-api-destination --name "$dest" >/dev/null 2>&1; then
    aws events update-api-destination --name "$dest" \
      --connection-arn "$CONNECTION_ARN" \
      --invocation-endpoint "$endpoint" \
      --http-method POST \
      --invocation-rate-limit-per-second 1 >/dev/null
  else
    aws events create-api-destination --name "$dest" \
      --connection-arn "$CONNECTION_ARN" \
      --invocation-endpoint "$endpoint" \
      --http-method POST \
      --invocation-rate-limit-per-second 1 >/dev/null
  fi

  dest_arn=$(aws events describe-api-destination --name "$dest" \
    --query ApiDestinationArn --output text)

  target=$(jq -n \
    --arg arn "$dest_arn" \
    --arg role "$SCHEDULER_ROLE_ARN" \
    --arg dlq "$DLQ_ARN" \
    '{
       Arn: $arn,
       RoleArn: $role,
       Input: "{}",
       RetryPolicy: { MaximumRetryAttempts: 2, MaximumEventAgeInSeconds: 3600 },
       DeadLetterConfig: { Arn: $dlq }
     }')

  action=create
  aws scheduler get-schedule --group-name "$GROUP" --name "$key" >/dev/null 2>&1 && action=update

  aws scheduler "${action}-schedule" \
    --group-name "$GROUP" \
    --name "$key" \
    --description "$desc" \
    --schedule-expression "$aws_cron" \
    --schedule-expression-timezone UTC \
    --flexible-time-window '{"Mode":"OFF"}' \
    --state ENABLED \
    --target "$target" >/dev/null

  printf '  %-28s %-22s %s\n' "$key" "$aws_cron" "$action"
done

echo
echo "registered in group $GROUP:"
aws scheduler list-schedules --group-name "$GROUP" \
  --query 'Schedules[].{name:Name,state:State}' --output table
echo
echo "expected: $count ENABLED schedules"
echo "smoke-test one job by hand:"
echo "  curl -X POST -H \"x-internal-job-token: \$INTERNAL_JOB_TOKEN\" $ADMIN_URL/api/jobs/session-cleanup"
