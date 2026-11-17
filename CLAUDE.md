# pherogent-site

## Repo layout

Root is the rebuilt app: Vite + React SPA (`src/`), Hono Worker (`worker/`), D1 migrations (`migrations/`); commands live in `package.json`, the deploy/migrations/secrets workflow in `docs/deploy.md`. `legacy/` is the retired ChatGPT Sites export, kept as the UX spec and the source for porting server modules and tests — nothing in it runs from the root toolchain.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues (JadeSChoi/pherogent-site) via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage labels are used as-is (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
