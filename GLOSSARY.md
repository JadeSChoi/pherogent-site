# Pherogent

An evidence-first workspace for bio researchers: a single author's environment for building, verifying, and writing up research, extensible over time with agent-invokable research skills. "Workspace" describes what Pherogent is now; "platform" is reserved for the long-term shape in which others contribute skills and tools.

## Language

**Workspace**:
The single-author research environment that Pherogent is today: one researcher's projects, sources, evidence, and manuscript in one place.
_Avoid_: platform (reserved for the long-term extensible shape), studio

**Project**:
A named container for one research effort: its research question, saved sources, notes, manuscript, and author decisions.
_Avoid_: workspace (that's the app), session

**Skill**:
A bounded, agent-invokable bio-research capability — an analysis or verification with a defined contract that an AI agent can call. The existing descriptive calculators are early prototypes of skills.
_Avoid_: tool (ambiguous with MCP tools and UI tools), calculator, feature

**Evidence check**:
An author-initiated verification of one manuscript sentence against retrieved source text, producing three distinct records: the AI suggestion, the code check, and the author's decision.
_Avoid_: sentence check, claim check, fact check

**Library**:
A Project's paper-discovery surface: searching Europe PMC, inspecting candidates, and holding the Project's saved sources.
_Avoid_: literature (the legacy view name), explore

**Saved source**:
A paper the author saved to a Project for reading, carrying a reading note and a reading status. Explicitly not an approved citation.
_Avoid_: reference (reserved for approved citations), bookmark

**Reading status**:
Where the author stands with a saved source: to read, useful, or conflicting. A reading state, not an evidence state.
_Avoid_: tag

**Notebook**:
A Project's working notes in four fields: findings & interpretation, limitations & alternatives, working hypothesis, and the next experiment or question. Hypotheses and proposed tests are not findings.
_Avoid_: analysis (the legacy view name)

**Manuscript**:
The one canonical document of a Project, written as ordered Sections and exported as Markdown.
_Avoid_: draft (the legacy term), document

**Section**:
One heading-and-text unit of the Manuscript: the unit of editing, size caps, and scoped checks (ADR 0004).
_Avoid_: chapter, block

**Review pass**:
One author-led review of one Section's prepared sentences against saved sources. Stale once the Section's text changes; decisions never carry over to changed text.
_Avoid_: evidence inbox (the legacy view name), review session

**Prepared sentence**:
A sentence selected from a Section by text splitting for evidence review. Preparation organizes text; it performs no scientific assessment.
_Avoid_: claim (the legacy term), span

**Assessment**:
The author's own judgment of how a source relates to a prepared sentence: supports, needs narrower wording, conflicts, or cannot verify.
_Avoid_: verdict (the legacy field name), label (reserved for AI suggestions)

**Decision**:
The author's explicit, recorded outcome for a prepared sentence — approve wording/citation, keep the original, or record a finding — always undoable. Nothing decides automatically.
_Avoid_: resolution, approval (only one decision kind)

**Evidence trail**:
A Project's durable record of every consented Evidence check run — its provenance, per-source outcomes, and whether it is still current — exportable as Markdown. Later edits mark entries as needing rechecking; they never erase them.
_Avoid_: audit log, history, run list

**Needs rechecking**:
The state of an Evidence check whose checked sentence or cited saved sources changed after the run. Its records stay visible as past records but can no longer feed an approval; only a new consented run clears it.
_Avoid_: stale (reserved for review passes), expired, invalidated

**Reopening (a check)**:
Re-attaching a recorded Evidence check to a sentence whose text and cited sources are unchanged since that run. Reopening is bookkeeping: no model call is made and nothing is spent.
_Avoid_: re-running (a new consented run), restoring

**Section chat**:
The per-Project chat surface: one picker over eleven writing sections (chat stages), each keeping its own conversation, working draft, and context note. The server derives the role from the section id; clients never supply prompts, models, or budgets, and nothing is sent without consent on the exact outgoing message and bounded context.
_Avoid_: agent studio (the legacy name), assistant

**Working draft (chat)**:
A chat section's own draft, separate from the Manuscript. Applying a suggestion preserves the prior version in its history and clears the reviewed mark; only a reviewed draft may be appended to the Manuscript, always as a new Section.
_Avoid_: output (ambiguous), suggestion (that's the unapplied proposal)

**Prepared example**:
A prewritten per-section exchange loadable with zero AI calls, labeled as prepared throughout. It demonstrates the chat and draft flow; it is never an AI response.
_Avoid_: demo reply, sample output

**Quote match**:
The code-only check that a passage the author pasted appears verbatim (whitespace aside) in a saved source's text. It checks text, not scientific support.
_Avoid_: verification, evidence match

**Keyword overlap**:
A plain word-share check between the wording to approve and the pasted passage. Low overlap demands explicit author acknowledgment before approval; it is never a scientific judgment.
_Avoid_: relevance score, similarity
