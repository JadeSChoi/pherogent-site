# Folio design direction: ink on paper, color means evidence

For the rebuilt Workspace's visual design (issue #3) we prototyped five directions over two rounds and chose "Folio": warm ivory paper and warm ink with no product accent color — color appears only as evidence state (olive supported, ochre caution, madder unsupported, muted unchecked) — Newsreader serif for reading surfaces and headings, Archivo for navigation, forms, and dense data surfaces, hairline rules instead of cards, and the evidence checks rendered as margin notes beside the manuscript text. The owner set the brief (feel: scholarly, chic, effortless, direct; references: Linear for finish, Readwise Reader for annotations beside text, Aesop for restraint) and picked Folio over "Study" (grotesk chrome with a botanical-green accent) after a revision pass that added a contents rail with project switcher, library filter chips, quieter marks for settled evidence states, and contrast fixes.

## Consequences

- Design tokens (color including dark mode, typography, spacing) are defined once in `src/ui/` and consumed by components; nothing restates them inline.
- No component may introduce a new accent color: anything colored is an evidence-state signal, so a reader can trust that color on any screen means "where the evidence stands."
- Serif (Newsreader) is reserved for reading surfaces and headings; Archivo covers UI chrome, forms, and dense data. New screens should decide which kind of surface they are before styling.
- The round-2 prototypes (and the rejected round-1 directions) live on the `prototype/design-directions` branch, not main.
