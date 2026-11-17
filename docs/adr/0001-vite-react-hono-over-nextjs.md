# Vite + React SPA + Hono Worker instead of Next.js/vinext

The inherited ChatGPT Sites export ships Next.js 16 and vinext (Cloudflare's Vite-based Next.js runtime, then freshly 1.0) in `package.json`, yet the actual client is hand-minified vanilla JS and the server layer is five routes: one static HTML shell and four JSON APIs, with all user content browser-local. For the client rebuild (Nov 2026) we chose a plain Vite + React SPA plus a small Hono Worker hosting the API routes on Cloudflare Workers + D1, and dropped Next.js and vinext entirely.

## Considered Options

- **vinext**: Cloudflare's recommended path for Next.js on Workers, but young (beta-labeled docs, not battle-tested) and it carries Next.js conventions the app doesn't use.
- **Next.js via OpenNext**: most established and job-market-recognizable, but the heaviest machinery for an app with no SSR/RSC need.
- **Vite + React SPA + Hono** (chosen): every piece boring and stable, shaped exactly like the app, and the least ongoing operational burden for a solo maintainer.

If the long-term platform phase ever needs SSR, revisit vinext then — it will be more mature.
