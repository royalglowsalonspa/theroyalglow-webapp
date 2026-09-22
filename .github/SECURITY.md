# Security Policy

The **Royal Glow Salon & Spa** project team takes security vulnerabilities
seriously. We appreciate coordinated disclosure and will work with reporters
to validate, fix, and credit disclosures responsibly.

## Supported versions

Only the latest minor release on the `prod` branch receives security fixes.
Older versions are not patched.

| Branch | Supported |
|--------|-----------|
| `prod` | ✅ Active |
| `pprd` | Mirrors `prod`; same fix once promoted |
| `test` | Mirrors `dev`; pre-production fix line |
| `dev` | All fixes land here first |
| older release tags | ❌ Not supported |

## Reporting a vulnerability

**Please do not file public GitHub issues for security vulnerabilities.**

Email **hello@theroyalglow.in** with:

- A clear subject line, e.g. `[SECURITY] <short description>`.
- A description of the issue and the impact you believe it has.
- Reproduction steps — minimal code, request/response samples, or a proof of
  concept. The more specific, the faster we can triage.
- The affected commit SHA, branch, or release tag if known.
- Your name / handle if you'd like to be credited in the fix announcement
  (otherwise we anonymize the report).

### What to expect

1. **Acknowledgement** within **2 business days**.
2. **Triage** within **5 business days**: we confirm the issue, scope the
   impact, and propose a fix timeline. We'll keep you updated at each
   milestone.
3. **Fix and disclosure**: we aim to ship a fix within **30 days** of
   confirmation. The fix lands on `dev` first, is promoted to `prod` per the
   normal release cadence, and is then publicly disclosed.

We follow a **coordinated disclosure** model: please give us a reasonable
window to investigate and patch before publishing details. We won't take
legal action against good-faith research that respects this window.

## Scope

The following are in scope for reports:

- Authentication / session handling in `apps/web`, `apps/admin`, `apps/cms`
  (Better Auth, OAuth flows, RBAC enforcement).
- Authorization bypasses across the four roles (Customer, Staff,
  Receptionist, Manager, Owner, Developer).
- Server-side request forgery, SQL injection, cross-tenant data leakage
  through Payload CMS or Neon DB queries.
- SSRF / file-upload vulnerabilities in the CMS media pipeline (Cloudflare
  R2).
- Secrets in committed code, CI logs, or build artifacts.
- Dependency vulnerabilities with a credible exploit path.
- Rate-limit bypass on `apps/web` / `apps/admin` public endpoints.

Out of scope (handled by upstream):

- Vulnerabilities in third-party SaaS providers (Neon, Cloudflare, Ably,
  Upstash, Resend, Brevo, Render, Google Cloud Run, Mintlify). Please report
  those to the vendor.

## Recognition

Researchers who report valid, in-scope vulnerabilities are credited in the
release notes of the fix unless they prefer to remain anonymous. We do not
currently run a paid bug-bounty program.

## Contact

- **Security disclosures:** hello@theroyalglow.in
- **Project / general questions:** see [`CONTRIBUTING.md`](./CONTRIBUTING.md)
- **Code of conduct violations:** see [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md)
