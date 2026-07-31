# ARCHIVED — EC2 + RDS deployment path (not in use)

Everything in this directory belongs to a **rejected** architecture. It is kept because it is
complete and verified, and because it is the fallback if the Lambda path ever fails.

**Do not deploy from these files.** The live plan is [`M2AWS.md`](../../../M2AWS.md):
`apps/web` + `apps/admin` on Lambda + CloudFront via SST, Neon retained, CMS on Render.

## Why it was rejected

It was designed for "entirely in AWS" — replacing Neon with RDS, Upstash with Valkey, QStash
with EventBridge Scheduler, Resend with SES, and running everything as containers on one EC2
instance behind Caddy.

Two things killed it:

1. **The premise was wrong.** The decision record claimed OpenNext could not run Next.js 16, so
   Lambda was off the table. In fact `@opennextjs/aws@4.1.0` declares
   `peerDependencies: { next: '>=15.5.21 <16 || >=16.2.11' }`, and this repo is on 16.2.12.
   Lambda was viable the whole time. The AWS docs compatibility page (topping out at Next 15.3.2)
   was stale relative to the package.
2. **Keeping Neon removes the reason for all of it.** RDS in a private subnet is what forced
   container compute: a VPC-attached Lambda needs a NAT Gateway (~$32/mo) to reach Google OAuth,
   Ably, Upstash and Resend. Neon speaks HTTP, needs no VPC, and therefore no NAT. Once Neon
   stays, Upstash/QStash/Resend/Ably have no reason to move either — so the application code
   changes drop from ten items to **zero**.

Cost comparison that followed: EC2 + RDS was free for 12 months then ~$24/mo, with a single
point of failure. Lambda + Neon is ~$0.50–1.00/mo indefinitely with no SPOF.

## What is here

| File | Role |
|---|---|
| `cloudformation/foundation.yml` | 28 resources: SGs, RDS 16, S3 ×2, CloudFront+OAC, ECR, IAM, Elastic IP, EC2 + inline bootstrap, 6 alarms, SNS, scheduler role + DLQ, budget |
| `Dockerfile.monorepo` (+ `.dockerignore`) | Single image containing all five deployables |
| `docker-compose.yml` | 8 services incl. Valkey + SRH, with memory caps for a 1 GiB host |
| `Caddyfile` | TLS + subdomain routing with active health checks |
| `user-data.sh` | Readable mirror of the EC2 bootstrap |
| `scripts/deploy.sh` | SSM-driven release + SHA rollback |
| `scripts/register-schedules.sh` | Ports the 15 QStash schedules to EventBridge Scheduler |
| `env/prod.*.env.example` | Five SSM `SecureString` templates |
| `README.md` | Original map of this directory |

Verified before archiving: all YAML parses, all shell scripts pass `bash -n`, and the cron
translator produces correct AWS expressions for all 15 real jobs. None of it was ever applied to
an AWS account.

## When to reach for it

- OpenNext breaks on a future Next.js release and the Lambda path stalls.
- You later decide you *do* want the database inside AWS (then `cloudformation/foundation.yml`
  and the `DB_DRIVER` factory work described in the old §7 become relevant again).
- You need long-running processes, WebSocket servers, or sidecar containers that Lambda cannot host.

If you resurrect this, re-check pinned versions first: the Docker Compose plugin URL, the Caddy
and Valkey image tags, and the AL2023 AMI SSM parameter.
