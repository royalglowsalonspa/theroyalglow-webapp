# `infra/aws` — AWS deployment artefacts

Everything here is **additive**. No application code is modified by these files,
and nothing runs until an AWS account is wired up.

The runbook that explains *why* each choice was made, in order, is
[`M2AWS.md`](../../M2AWS.md) at the repo root. This file is just the map.

| Path | Role | Runbook |
|---|---|---|
| `cloudformation/foundation.yml` | One stack: security groups, RDS, S3 ×2, CloudFront+OAC, ECR, IAM, Elastic IP, EC2 (+ inline bootstrap), CloudWatch alarms, SNS, scheduler role + DLQ, budget | §6 |
| `Dockerfile.monorepo` | Single image containing all five deployables | §9.2 |
| `Dockerfile.monorepo.dockerignore` | Build context rules (keeps `docs/` and `*.md`, unlike the root `.dockerignore`) | §9.2 |
| `docker-compose.yml` | 8 services: caddy, web, admin, cms, docs, invoicing, valkey, srh | §9 |
| `Caddyfile` | TLS + subdomain routing | §9 |
| `user-data.sh` | Readable copy of the EC2 bootstrap (authoritative copy is inline in the template) | §9.1 |
| `scripts/deploy.sh` | Release + rollback, runs on the host via SSM | §9.3 |
| `scripts/register-schedules.sh` | Creates the 15 EventBridge schedules from `apps/admin/src/lib/jobs/schedules.ts` | §11.1 |
| `env/prod.*.env.example` | Templates for the five SSM `SecureString` env blobs | §6.1 |
| `../../.github/workflows/deploy-aws.yml` | CI: build → ECR → SSM release → health → auto-rollback | §17 |

## Ground rules

- **Run from Linux.** WSL2, a Linux host, or AWS CloudShell. Docker builds of this
  monorepo are not reliable from Windows.
- **`env/prod.*.env` is gitignored.** It exists only long enough to upload to SSM
  Parameter Store, then delete it. SSM is the system of record.
- **Never `drizzle-kit push`** against RDS, exactly as with Neon. See
  `.kiro/steering/migration-discipline.md`.
- **`caddy_data` must survive redeploys** or Let's Encrypt will rate-limit
  certificate issuance.

## Order of operations

```
M2AWS §5   prerequisites: account, MFA, CLI, request SES production access
M2AWS §6   deploy foundation.yml, confirm SNS email, write SSM params
M2AWS §7   DB_DRIVER code change, Neon -> RDS dump/restore, verify no drift
M2AWS §8   copy R2 objects to S3
M2AWS §9   build + push image, deploy.sh, check `docker stats`
M2AWS §11  register-schedules.sh, smoke one job
M2AWS §13  SES DKIM/SPF/DMARC, out of sandbox
M2AWS §16  pre-flight with --resolve, THEN move DNS
```

Render, Cloudflare and Neon stay live and untouched until §16, and remain the
rollback path for 7 days after cutover.
