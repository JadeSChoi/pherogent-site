# One review pass per Section

The Review model shipped (#9) holding a single pass per project (`Project.review`), and preparing a different Section replaced it wholesale — so an author reviewing Section B silently lost Section A's recorded decisions, and no cross-Section surface (an Evidence rail destination, the proof-sheet's margin notes across the whole Manuscript, review progress on the Overview) could exist. We decided (issue #22) to key passes by Section: `Project.reviews` holds at most one pass per Section, preparing one Section replaces only that Section's pass, and every #9/#18 rule — staleness, carry-over to byte-identical sentences, the undecided-only cap, duplicate handling, the context-changed note (ADR 0005) — applies within a pass exactly as before. Staleness is scoped: editing one Section blocks only that Section's pass.

## Consequences

- A pre-ADR-0006 backup's single `review` imports as that Section's one pass, and browser-stored workspaces migrate the same way on load, so no existing decision is lost. Exports write `reviews`; older app versions would drop the field on import, which is acceptable for a single-author product moving forward.
- An unreadable pass is dropped alone on import (like a damaged saved source); one Section's corruption never takes other Sections' decisions down. Offset anchoring is validated per pass against its own baseText, as before.
- Sentence ids remain unique across passes (UUIDs), so actions address a sentence without naming its Section.
