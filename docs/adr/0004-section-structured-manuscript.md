# Section-structured Manuscript: full-length writing, bounded per section

The Manuscript shipped (issue #8) as a single string capped at 12,000 characters — a limit inherited from the legacy prototype, where it protected full-text operations (whole-app re-render on input, full-text sentence segmentation, substring duplicate detection), not storage or AI context: evidence checks already operate on one selected sentence (≤2,000 characters at the server contract) and the manuscript is never sent to a model. That cap is far too short for a real paper, so the Manuscript becomes an ordered list of Sections (`{ id, heading, text }`), each capped around 20,000 characters, with no document-level limit beyond a high corruption guard. Every operation that was full-text becomes per-section: editing, sentence preparation, appending notebook notes (a note appends as a Section with identity, replacing substring dedupe), and import (split on `## ` headings). Markdown stays the canonical export, joined on `## heading`, and the rendered page must still read as one continuous document in the Folio style — headings flowing in a single page, not a stack of separate boxes.

Persistence stays browser-local (ADR 0002) on localStorage, with saves debounced instead of per-keystroke. Moving to IndexedDB was considered and deliberately deferred: revisit it when a workspace approaches the ~5 MB localStorage quota or debounced saves still produce noticeable main-thread stalls — IndexedDB then removes both the quota and the synchronous writes without changing the backup format.

## Consequences

- The backup format gains sectioned manuscripts; a v3 backup's string manuscript imports by splitting on `## ` headings (one Section when there are none), and a v2 backup's parked `legacy` draft is ported into the sectioned Manuscript on import. No existing backup becomes unreadable.
- The AI-check server contract is unchanged: checks stay per selected sentence, and budgets are independent of manuscript length. Future section-scoped features (for example a section picker) address Sections by id.
- The per-section cap is the operational bound; nothing may reintroduce a small document-level limit.
- UI work on the Manuscript must preserve the one-continuous-document reading surface; per-section editing chrome may not fragment it into cards (ADR 0003).
