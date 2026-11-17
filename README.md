# Pherogent

An evidence-first workspace for bio researchers, extensible with
agent-invokable research skills. Currently being rebuilt from a ChatGPT Sites
export onto the owner's own infrastructure (see `docs/adr/` for the decisions).

## Stack

Vite + React 19 SPA, served by a Hono Worker on Cloudflare Workers with a D1
database. Deployed by GitHub Actions on every push to `main` — see
`docs/deploy.md`.

## Development

```sh
npm install
npm run db:migrate   # apply D1 migrations to the local database
npm run dev          # SPA + worker + local D1 at http://localhost:5173
npm test             # vitest, runs the worker in workerd against local D1
npm run typecheck    # generates worker types, then tsc -b
npm run build        # production build into dist/
```

## Layout

- `src/` — React SPA
- `worker/` — Hono Worker (API routes)
- `migrations/` — D1 SQL migrations (`docs/deploy.md` has the workflow)
- `tests/` — worker integration tests
- `legacy/` — the retired ChatGPT Sites export: the old client (kept as the UX
  spec for the rebuild), the server modules and test suites still to be
  ported, and reference configs. Nothing in it runs from the root toolchain.
- `docs/adr/`, `GLOSSARY.md` — decisions and domain language
