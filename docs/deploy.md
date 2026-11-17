# Deployment

The app is a Cloudflare Worker (Hono API + static SPA assets) with a D1
database, deployed to the owner's Cloudflare account at a workers.dev URL.
GitHub Actions deploys it on every push to `main`; nothing is deployed by hand.

## How a deploy happens

`.github/workflows/ci.yml` runs two jobs:

1. **test** — `npm run typecheck`, `npm test`, `npm run build` on every push
   and pull request.
2. **deploy** — runs only for pushes to `main` and only if **test** is green
   (`needs: test`). It builds, applies pending D1 migrations to the remote
   database, then deploys the Worker from the Vite-emitted config at
   `dist/pherogent/wrangler.json`.

A red test job therefore blocks the deploy job entirely.

## One-time provisioning (owner only)

Run the interactive wizard, which walks through every step only a human can
do (Cloudflare login, D1 creation, API token, GitHub secrets):

```sh
./scripts/setup-cloudflare.sh
```

It ends with `wrangler.jsonc` holding the real D1 `database_id` and the two
GitHub Actions secrets set. After that, every push to `main` deploys.

## D1 migrations

Migrations are plain SQL files in `migrations/`, named `NNNN_description.sql`,
applied in order by wrangler, which records them in the `d1_migrations` table.

- **Add one**: create the next-numbered file in `migrations/`.
- **Local dev database**: `npm run db:migrate` (applies to the local D1 in
  `.wrangler/state`, which `npm run dev` also uses).
- **Tests**: applied automatically per test run by `tests/apply-migrations.ts`.
- **Production**: applied by CI (`wrangler d1 migrations apply pherogent
  --remote`) before each deploy. To apply by hand: `npm run db:migrate:remote`.

## Secrets

No secret is ever committed; `.env*`, `.dev.vars*` are gitignored.

- **CI credentials**: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` live
  as GitHub Actions repository secrets (set by the wizard via `gh secret set`).
- **Worker runtime secrets** (e.g. `OPENAI_API_KEY` when the AI provider is
  ported): set with `npx wrangler secret put NAME`, read from `env` in the
  Worker. For local dev, put them in a gitignored `.dev.vars` file.

## Manual deploy (escape hatch)

With `wrangler login` done locally, `npm run deploy` builds and deploys the
same way CI does. Prefer CI.
