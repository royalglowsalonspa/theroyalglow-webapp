#!/bin/bash
# =============================================================================
# EC2 instance bootstrap — READABLE MIRROR (M2AWS §9.1)
# -----------------------------------------------------------------------------
# The AUTHORITATIVE copy of this script is inline in the `AppInstance.UserData`
# property of cloudformation/foundation.yml, because CloudFormation cannot
# reference an external file for UserData.
#
# This copy exists so the bootstrap is reviewable and diffable without reading
# YAML. If you change one, change the other. The template version additionally
# substitutes ${AWS::Region}, ${ProjectName}, ${EnvName}, ${AWS::AccountId} and
# ${BackupBucket} via Fn::Sub — the placeholders below stand in for those.
#
# Runs once, as root, on first boot. Log: /var/log/rgss-bootstrap.log
# =============================================================================
set -euxo pipefail
exec > >(tee /var/log/rgss-bootstrap.log) 2>&1

AWS_REGION="${AWS_REGION:-ap-south-1}"
PROJECT="${PROJECT:-rgss}"
ENV_NAME="${ENV_NAME:-prod}"
ACCOUNT_ID="${ACCOUNT_ID:?substituted by CloudFormation}"
CONFIG_BUCKET="${CONFIG_BUCKET:?substituted by CloudFormation}"

dnf update -y
dnf install -y docker jq amazon-cloudwatch-agent postgresql16

# --- swap: 1 GiB of RAM cannot hold 5 Node servers without it ----------------
if [ ! -f /swapfile ]; then
  dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
sysctl -w vm.swappiness=10
echo 'vm.swappiness=10' > /etc/sysctl.d/99-rgss.conf

# --- docker + compose v2 plugin ----------------------------------------------
systemctl enable --now docker
usermod -aG docker ec2-user
install -d /usr/local/lib/docker/cli-plugins
curl -fsSL \
  "https://github.com/docker/compose/releases/download/v2.32.4/docker-compose-linux-x86_64" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# --- layout ------------------------------------------------------------------
install -d -m 755 /opt/rgss
install -d -m 700 /opt/rgss/env
cat > /opt/rgss/stack.env <<ENVEOF
AWS_REGION=${AWS_REGION}
PROJECT=${PROJECT}
ENV_NAME=${ENV_NAME}
ECR_URI=${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${PROJECT}-${ENV_NAME}
CONFIG_BUCKET=${CONFIG_BUCKET}
LOG_GROUP=/${PROJECT}/${ENV_NAME}/app
ENVEOF

# --- CloudWatch agent: EC2 does not report memory or disk by default ---------
cat > /opt/aws/amazon-cloudwatch-agent/etc/rgss.json <<'CWEOF'
{
  "agent": { "metrics_collection_interval": 60 },
  "metrics": {
    "append_dimensions": { "InstanceId": "${aws:InstanceId}" },
    "aggregation_dimensions": [["InstanceId"]],
    "metrics_collected": {
      "mem": { "measurement": ["mem_used_percent"] },
      "swap": { "measurement": ["swap_used_percent"] },
      "disk": {
        "resources": ["/"],
        "measurement": ["disk_used_percent"],
        "ignore_file_system_types": ["sysfs", "tmpfs", "devtmpfs", "overlay"]
      }
    }
  }
}
CWEOF
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config -m ec2 -s -c file:/opt/aws/amazon-cloudwatch-agent/etc/rgss.json

# --- pull deploy config, then release if an image already exists --------------
# CI uploads docker-compose.yml, Caddyfile and deploy.sh to
# s3://<CONFIG_BUCKET>/config/ before it invokes deploy.sh. On a first boot the
# prefix may be empty; failing soft here is intentional.
aws s3 cp "s3://${CONFIG_BUCKET}/config/" /opt/rgss/ --recursive || true
chmod +x /opt/rgss/deploy.sh 2>/dev/null || true
if [ -x /opt/rgss/deploy.sh ]; then /opt/rgss/deploy.sh latest || true; fi
