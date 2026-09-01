# AWS Guidance

<!--
Source: https://raw.githubusercontent.com/aws/agent-toolkit-for-aws/refs/heads/main/rules/aws-agent-rules.md
Installed by the Agent Toolkit for AWS setup (setup-instructions/setup.md, Step 7).
Content below is verbatim from AWS. Project-specific notes are appended at the
bottom under "RGSS project context" — keep that separation so the upstream
section can be refreshed by re-running the setup.
-->

- Prefer the AWS MCP Server for AWS interactions — it provides sandboxed
  execution, observability, and audit logging. If unavailable, use the
  AWS CLI directly.
- Before starting a task, check whether a relevant AWS skill is available.
  Load the skill with `retrieve_skill` and prefer its guidance over
  general knowledge.
- When uncertain about specific AWS details (API parameters, permissions,
  limits, error codes), verify against documentation rather than guessing.
  State uncertainty explicitly if you cannot confirm.
- When creating infrastructure, prefer infrastructure-as-code (AWS CDK or
  CloudFormation) over direct CLI commands.
- When working with infrastructure, follow AWS Well-Architected Framework
  principles.
- Do not use em dashes in AWS resource names or descriptions. Use
  hyphens instead.

## Secret Safety

- MUST load the `aws-secrets-manager` skill first for any secret,
  credential, API key, token, or password task. MUST NOT call
  `secretsmanager get-secret-value` or `batch-get-secret-value`, and MUST
  NOT hit the Secrets Manager Agent daemon directly. MUST use
  `{{resolve:secretsmanager:secret-id:SecretString:json-key}}` with
  `asm-exec` so the secret resolves at runtime without entering context.

---

## RGSS project context

Appended locally, not part of the upstream AWS rules file.

| Fact | Value |
|---|---|
| Account | `343277178041` |
| Region | `ap-southeast-1` (Singapore) — co-located with Neon; see `M2AWS.md` §3 |
| Toolkit service region | `us-east-1` only (`aws agent-toolkit ...` commands) |
| AWS CLI | v2, user-local install at `%LOCALAPPDATA%\Programs\Amazon\AWSCLIV2` |
| Auth | `aws login` (browser). Credentials last 12 h, renewable 90 days. |

**IaC choice.** The upstream rule prefers CDK or CloudFormation. This project uses
**SST v3** (`sst.config.ts`), which is IaC on Pulumi and satisfies the intent — declarative,
version-controlled, reviewable. Both `apps/web` and `apps/admin` are declared with
`sst.aws.Nextjs`, which uses OpenNext's AWS implementation to provision AWS Lambda and
CloudFront. Production deploys run through `.github/workflows/deploy-aws.yml`; use
`bunx sst deploy` for an equivalent manual deployment. Do not hand-create these resources or
install/use Wrangler or a Cloudflare compute adapter. The archived CloudFormation template at
`infra/aws/_ec2-path/` belongs to a rejected architecture.

**Scope.** Only `apps/web` and `apps/admin` run on AWS. `apps/cms` stays on Render,
`apps/invoicing` on Cloud Run, and Neon, Upstash, QStash, Resend, Ably and Cloudflare R2 are
unchanged. Do not "helpfully" migrate these to AWS equivalents — that was explicitly rejected
(`M2AWS.md` §2). Service catalogue and availability requests currently read Neon directly; no
Upstash cache is implemented. A future five-minute cache may use Upstash, but do not add
Cloudflare Worker KV.

**Cloudflare boundary.** Cloudflare remains authoritative DNS and R2 storage, not compute.
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_DEFAULT_ACCOUNT_ID` are used only by SST's DNS
integration during deployment. They are not Lambda runtime settings. R2 continues to use
canonical `R2_*` credentials plus `NEXT_PUBLIC_R2_PUBLIC_URL`; do not rename them to
`CLOUDFLARE_R2_*`.

**Secrets.** Server secrets belong in SST Secrets (`bunx sst secret set …`), which stores them in
SSM Parameter Store. `NEXT_PUBLIC_*` values are build-time only and are supplied as GitHub Actions
variables — putting them in a secret store has no effect on the client bundle. DNS-only Cloudflare
credentials belong in the deployment environment, not either application's runtime.

**Do not use the root user.** See `M2AWS.md` §5.
