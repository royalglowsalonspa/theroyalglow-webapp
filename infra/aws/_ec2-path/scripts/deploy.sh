#!/usr/bin/env bash
# =============================================================================
# RGSS release script — runs ON the EC2 host (M2AWS §9.3)
# -----------------------------------------------------------------------------
# Usage (via SSM, never SSH):
#   aws ssm send-command --instance-ids <id> \
#     --document-name AWS-RunShellScript \
#     --parameters 'commands=["/opt/rgss/deploy.sh <image-tag>"]'
#
# <image-tag> is a git short SHA, or "latest". Because every CI build pushes an
# immutable SHA tag, rollback is this same script with the previous SHA.
#
# Secrets flow: SSM Parameter Store -> /opt/rgss/env/*.env (mode 600) -> compose
# env_file. They never enter the image, the compose file, or the command line.
# =============================================================================
set -euo pipefail

TAG="${1:-latest}"
STACK_DIR=/opt/rgss
ENV_DIR="$STACK_DIR/env"

# stack.env is written by the instance bootstrap (CloudFormation UserData) and
# carries AWS_REGION, PROJECT, ENV_NAME, ECR_URI, CONFIG_BUCKET, LOG_GROUP.
# shellcheck source=/dev/null
source "$STACK_DIR/stack.env"

export AWS_REGION
export AWS_DEFAULT_REGION="$AWS_REGION"
export IMAGE="${ECR_URI}:${TAG}"
export LOG_GROUP

log() { echo "[deploy $(date -u +%H:%M:%S)] $*"; }

log "releasing $IMAGE"

# --- 1. Refresh deploy config (compose file + Caddyfile + this script) -------
# CI uploads them to s3://<CONFIG_BUCKET>/config/ before invoking this script.
aws s3 cp "s3://${CONFIG_BUCKET}/config/docker-compose.yml" "$STACK_DIR/docker-compose.yml"
aws s3 cp "s3://${CONFIG_BUCKET}/config/Caddyfile" "$STACK_DIR/Caddyfile"

# --- 2. Materialise per-app env files from SSM ------------------------------
install -d -m 700 "$ENV_DIR"
for app in web admin cms invoicing; do
  param="/${PROJECT}/${ENV_NAME}/${app}/env"
  log "fetching $param"
  umask 077
  aws ssm get-parameter --name "$param" --with-decryption \
    --query 'Parameter.Value' --output text > "$ENV_DIR/${app}.env"
  chmod 600 "$ENV_DIR/${app}.env"
done

# Stack-level values compose itself interpolates. ACME_EMAIL and SRH_TOKEN are
# read from the shared stack parameter so they are defined exactly once.
STACK_PARAM="/${PROJECT}/${ENV_NAME}/stack/env"
if aws ssm get-parameter --name "$STACK_PARAM" --with-decryption \
     --query 'Parameter.Value' --output text > "$ENV_DIR/stack.env" 2>/dev/null; then
  chmod 600 "$ENV_DIR/stack.env"
  set -a
  # shellcheck source=/dev/null
  source "$ENV_DIR/stack.env"
  set +a
else
  log "WARNING: $STACK_PARAM missing — ACME_EMAIL / SRH_TOKEN must come from it"
fi

# --- 3. Pull the image ------------------------------------------------------
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "${ECR_URI%%/*}"

docker pull "$IMAGE"

# --- 4. Release -------------------------------------------------------------
cd "$STACK_DIR"
docker compose up -d --remove-orphans

# --- 5. Wait for the two customer-facing apps to report healthy -------------
log "waiting for health"
deadline=$(( SECONDS + 300 ))
while (( SECONDS < deadline )); do
  health_of() {
    docker compose ps -q "$1" \
      | xargs -r docker inspect -f '{{.State.Health.Status}}' 2>/dev/null \
      || echo starting
  }
  web_state=$(health_of web)
  admin_state=$(health_of admin)
  if [[ "$web_state" == healthy && "$admin_state" == healthy ]]; then
    log "web + admin healthy"
    break
  fi
  if [[ "$web_state" == unhealthy || "$admin_state" == unhealthy ]]; then
    log "ERROR: container reported unhealthy (web=$web_state admin=$admin_state)"
    docker compose logs --tail 80 web admin
    exit 1
  fi
  sleep 10
done

if (( SECONDS >= deadline )); then
  log "ERROR: timed out waiting for health"
  docker compose logs --tail 80 web admin
  exit 1
fi

# --- 6. Record the release so CI can roll back to it ------------------------
# Written only after health passed, so it always names a KNOWN-GOOD tag.
printf 'IMAGE=%s\nTAG=%s\nAT=%s\n' "$IMAGE" "$TAG" "$(date -u +%FT%TZ)" \
  > "$STACK_DIR/.last-release"

# --- 7. Reclaim disk (30 GB volume, ~2 GB per image) ------------------------
docker image prune -af --filter 'until=168h' >/dev/null 2>&1 || true

log "release complete: $IMAGE"
