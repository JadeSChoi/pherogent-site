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
