# @rgss/cms

Payload CMS v3 — Phase 8 placeholder.

This application will host the headless CMS for marketing content (blog, gallery, team, banners, FAQ) at `admin.theroyalglow.in`.

## Setup (Phase 8)

- Payload CMS v3 with Neon PostgreSQL adapter
- Cloudflare R2 for media storage
- Collections: blog, gallery, team, banners, FAQ

## Deploy to Render

This app is deployed to Render via the `render.yaml` Blueprint at the **repo root**.

1. In Render: **New + > Blueprint**, connect this repository. Render reads `render.yaml` and provisions the `rgss-cms` web service.
2. Set the `sync: false` secrets in the Render dashboard (never committed):
   - `DATABASE_URL` (Neon pooled connection)
   - `PAYLOAD_SECRET` (min 32 chars)
   - `PAYLOAD_PUBLIC_SERVER_URL` = `https://cms.theroyalglow.in`
   - `WEB_APP_URL` = `https://theroyalglow.in`
   - `R2_BUCKET_NAME`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
   - `NEXT_PUBLIC_R2_PUBLIC_URL`
3. Attach the custom domain `cms.theroyalglow.in` (Settings > Custom Domains) and add the shown CNAME in DNS.
4. Enable auto-deploy on the **`prod`** branch (already set as `branch: prod` in the Blueprint).

Build installs all Bun workspace deps from the root, then builds only `@rgss/cms`. The pre-deploy step runs Payload migrations (`bun run migrate`) against Neon before the new instance goes live. Health check path is `/admin`.
