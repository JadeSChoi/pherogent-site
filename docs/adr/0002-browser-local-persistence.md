# Project content stays browser-local; no accounts or server-side storage

Pherogent aims to become a product, so a reader will expect server-side project storage and accounts — their absence is deliberate. In the current workspace phase (one author: the owner), all project content lives in browser storage with JSON export/import as the backup and portability story; the server stores only spending ledgers (D1). Building accounts and sync now would cost weeks of infrastructure plumbing that serves none of the project's present goals (agentic-AI skill-building, portfolio, dogfooding), and a clean client-side storage module keeps the door open.

## Consequences

- The rebuild must include an import/restore UI, and it must read backups exported by the current version (`pherogent-evidence-workspace-v2` JSON), so existing projects carry across.
- The owner's research data lives in one browser profile until this is revisited; export regularly.
- Revisit this decision when the product/platform phase gives a concrete reason (multi-device, collaborators, or paying users).
