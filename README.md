# Pherogent — Interactive Research Workspace

An HTML/CSS/JavaScript research workspace, published to the existing Site connected to `www.pherogent.ai`. The interactive agent studio combines focused chats, shared project context and editable section outputs. Hosted AI replies require explicit consent and available shared allowance; prepared examples remain available without AI.

## Study-design preview: were the same cells tracked?

In **Results** or **References**, choose **Check study design**. Paste a sentence and a methods excerpt, or try **Cell recovery example** and **One-site example**. This browser-local rule consumes no model tokens and makes no manuscript edits. It detects a limited set of English descriptions of longitudinal same-cell tracking. Missing or conflicting methods leave the inference unassessed. A compatible design alone does not establish an outcome.

AI integration is **off by default**. Opt in on a Results/References chat consent screen, or in **Evidence inbox → Check this sentence** when choosing evidence. A sentence check uses independently retrieved excerpts from that paper. The chat can use a single selected attachment excerpt (author-supplied, not verified), and treats missing design details conservatively. Both use the same versioned rule; there is no extra model call. Saved checks distinguish the AI suggestion, the code check and the author's decision. Reuse respects the selected mode; old checks are not relabeled.

[Evaluation and replay instructions](evals/study-design/README.md): the rule matched the expected outcomes on 12 illustrative development cases. A separate assistant given written rules already avoided all 5 unsupported endorsements and answered all 7 supported cases; applying code to those same answers changed no verdicts. The hosted model was not benchmarked. Keep automatic enforcement opt-in pending a larger comparison on independent material.

## Checking what the paper reader actually retrieved

For a no-model smoke test, search Europe PMC for `DOI:"10.1038/s41586-026-10652-y"` in the literature search and open the returned record. With the MCP connector, call `search_papers` with the same query, then `read_paper` with its returned ID (`MED:42156546`). Verify the ID, title and access before using a passage. A PMID and its corresponding PMCID can name the same study; the selected-source checker records the link and counts the paper once.

For a saved sentence check with selected sources, open **Project tools → Evidence inbox → All checks → Selected sources**. Each selected ID has an outcome: record not retrieved, no readable text, text read without a verified quote, or quote matched with its separate assessment and author status. An unfinished or older check may have no confirmed coverage. The Markdown evidence trail includes these outcomes. Missing text leaves support unassessed; a literal quote match alone does not validate an inference.

## Sentence checks and evidence inbox (v25)

The existing research workflow is retained. From **Manuscript → Prepare sentences for review → Evidence inbox**, select **Check this sentence**, choose a saved Europe PMC source or a wider search, then review and grant consent. This version links a paper by explicit selection; it does not automatically parse a bibliography or resolve arbitrary citations.

The original sentence and ID are immutable inputs. The server fetches paper text itself and discards AI cards with a different sentence/ID, unknown source/passage, or nonmatching quote. A selected-source check inspects only the chosen IDs, normally with one judge call. **Find additional evidence** starts a separately consented bounded search. Legacy freeform research remains available.

Completed checks persist locally with original text, source snapshots, passages, AI labels, author decisions, elapsed time and usage. Unchanged checks reopen without a model call. Edited sentences or changed saved source text/metadata show **Needs rechecking** and block outdated approval. Unchanged sentence IDs survive re-preparing after unrelated edits; author approvals still reset when explicitly starting a fresh review. Sources are not monitored remotely: changes at a publisher are discovered only on a new retrieval.

After approval, **Context → Add input → Approved evidence** explicitly copies an evidence snapshot into a chosen writing workspace. Editing/revoking the underlying sentence, approval or source marks the copy outdated and blocks sending until it is detached or replaced. No AI verdict is silently reapplied to the narrower author-approved wording. No manuscript edit, handoff, search, retry or paid call occurs automatically.

**Export → Evidence trail (.md)** and the Review log JSON include run provenance. Existing manuscript/BibTeX exports still include only current author-approved citations. All existing shared token/dollar reservations, rate limits and idempotency rules remain unchanged. A fresh check still reserves the full per-run allowance even when actual usage is lower.

Validation covers exact-claim binding, wrong/fabricated sources, source-only retrieval, stale approvals, low-overlap confirmation races, duplicate-sentence identity, free saved reuse, immutable writing-workspace snapshots, and exports. Tests use mock model responses and do not measure scientific accuracy. No SciFact score or researcher-pilot result is claimed.

Manual check: use the sample project or your own paragraph, start one source check, inspect the unchanged original alongside its suggestion, open the card for author review, approve or retain it, attach approved evidence to Discussion, then edit the sentence and confirm the old check and linked input need rechecking. Reopening the unchanged saved run must not increase usage. Prepared tutorial actions remain free of AI calls.

## Using the product

The app has an interactive research map, persistent agent navigation, project switching, and one shared manuscript. Tours are optional; the real controls remain usable without them.

- **Projects:** create a named project with an optional research question, switch projects from the header, or open an independent editable sample. Changes stay with the active project.
- **Research workflow:** one interactive phase navigator replaces the former Graph/Outline choices. Plan, Build evidence, Write, and Review & finish stay visible; selecting a phase reveals its two or three workspaces beside the selected input/output details. Any phase can be opened at any time. Following a suggested destination switches to that phase, and each project remembers the selected workspace per phase. Draft filtering is scoped to the current phase, with an escape to pending drafts elsewhere. Evidence review, the source library, real reviewed-copy handoffs and the walkthrough remain available. Recommendations and counts use saved author work; they do not run AI or establish scientific validity. Previous graph layout metadata is retained harmlessly in backups, while old view preferences migrate to the single workflow.
- **Agent workspaces:** Organizer, Data, Methods, Results, Figures, Title, Introduction, Discussion, Abstract, References and Review each retain a separate conversation, composer and editable output. Custom messages open a consent panel showing the exact bounded context and shared allowance. When the server is configured, one role-specific model request generates a reply and optional section-draft suggestion. When it is not configured, the composer is preserved and no AI reply is fabricated. Example prompts load prepared content, never pretend to run AI, and use zero AI tokens.
- **Context and handoffs:** select project sources, paste notes or import local text into a particular agent. Review an output before passing a snapshot to another agent. The recipient gets that reviewed copy, not the sender's conversation; later changes do not silently update it.
- **Author control:** edit an output, mark it reviewed, then confirm **Add to manuscript**. Editing resets review status. Insertion appends to existing text and does not approve citations. **Undo addition** restores the prior draft only while no intervening manuscript edits would be lost.
- **Research brief:** in an agent's **Context**, choose **Edit research brief** to edit the question, aim and hypothesis. **Back to workspace** opens the original research tasks and notes.
- **Library:** search Europe PMC, inspect abstracts, save papers, record reading notes/status, and explicitly copy a source note into the notebook. Saving a paper is not citation approval.
- **Notebook:** edit findings, limitations, hypotheses, and next experiments. Append notes to the manuscript without replacing existing text.
- **Manuscript:** edit one canonical draft, import `.txt`/`.md`, add missing section headings, focus an outline section, export, and prepare up to five sentences for review.
- **Evidence review:** inspect an exact passage, record an author assessment, approve wording/citations, retain or flag a sentence, and undo decisions. Low keyword overlap requires explicit acknowledgment. This is separate from the References agent's draft workspace.
- **Activity:** project-specific searches, author actions and decisions.
- **Usage & budget:** actual reported tokens, estimated model cost, recorded runs and server spending limits. Unconfirmed values stay unknown. **Illustrative demo** uses clearly labelled fictitious data in the dashboard only; it never writes runs, spends tokens or changes the real allowance. Reservations are shown separately from charges.
- **Exports:** research notes and manuscript in Markdown, approved bibliography in BibTeX, Activity JSON and a full JSON backup of all local projects. **Preview manuscript** opens the actual Markdown export in a selectable, read-only field for review or manual copying before downloading.

## Full research walkthrough

Choose **Walkthrough** on the Research workflow. The invitation opens before any project changes; **Start or resume practice** opens an independent Cellular reversal practice project. **Create a fresh practice** starts another copy. The 14 action-gated steps cover navigation, research question, Data context, Methods review, a Results-to-Discussion handoff, Figures, Discussion, Introduction, Title, Abstract, manuscript insertion, evidence-backed citation approval, final review and an actual export.

Each step requires its stated product action. Opening a prepared example does not count as author review, opening Export does not count as downloading, and reviewing a section does not approve a citation. **Pause**, **Resume**, **Back** and **Skip this step** keep the workflow optional. Skips are recorded separately from completed actions. Progress and practice writing persist across reloads; other projects remain independent. This tour uses prepared material and never runs AI or analyzes data.

## Original evidence-review tutorial

**Help → Practice evidence review** starts or resumes a separate **Cellular reversal** practice project. It does not replace existing writing, sources, notes or decisions. This is distinct from **Workspace tour**, which introduces the new agent panels. The evidence guide highlights real controls and shows seven missions:

1. **Set the question:** read or edit the practice question.
2. **Find evidence:** click **Search papers** to retrieve Lu (2020), PMID 33268865, from Europe PMC. The prefilled query does not send a request by itself.
3. **Save a source:** inspect the abstract and save the paper to the project.
4. **Capture a finding:** write a reading note, or explicitly insert the prepared example note, then choose **Add note to notebook**.
5. **Write a claim:** write a sentence, or insert the example claiming that vision recovery demonstrates a preserved cellular archive being read, then click **Prepare sentences for review**.
6. **Verify a passage:** enter an exact passage and review the assessment fields. The optional prepared example supplies a quote and suggested narrower wording; the ordinary quote checker still verifies the text.
7. **Approve the wording:** the author explicitly chooses **Apply wording + citation**. The completion screen links back to the original project or lets the user keep exploring the practice project.

Progress depends on completed actions, not a timed animation. Saving a source or verifying a quote never approves a citation. The tutorial cannot approve or edit the manuscript on the author's behalf.

**Skip tutorial · keep my progress**, the close button, or Escape pauses the guide. **Resume tutorial** continues the saved mission for the current demo version; reload also preserves progress. A tour saved from the earlier example pauses safely and starts a separate updated practice project when resumed, keeping the old practice and return-project identity. Switching to another project pauses the guide so practice helpers cannot change that project's work. Users can navigate freely and choose **Return to this mission**. Starting practice again after completion creates a fresh practice project while retaining previous projects.

If live search is unavailable, **Use prepared paper instead** explicitly loads the bundled record without a network request. This path is labeled prepared throughout; it is not a recorded AI run. Example notes and review suggestions are also prepared material. No AI model is called on either path.

## Editable sample

**Open sample project** is separate from the tutorial's practice project. It now adapts selected concepts from **Cellular Blockchain: A Developmental Model of Distributed Epigenetic Information**, v1.1, sections 5, 8 and E5. The full manuscript is not bundled or published. The sample contains an editable research question, plan, source notes, hypothesis notebook, proposed experiment and manuscript claims, so testers can use the whole research workflow as well as reference review.

The research question separates three candidate explanations for reversal: withdrawal of an activating signal, a new state that resembles an earlier one (a compensating append), and retrieval of a preserved historical record (an archive read). These are hypothesis-level distinctions. "Cellular blockchain" is a model metaphor; the demo does not establish that cells compute hashes, run consensus or retrieve an epigenetic archive.

The prepared source collection includes:

- Mooijman et al. (2016), PMID **27347753**: lineage reconstruction from single-cell methylation measurements. Reconstructing lineage is not the same as recovering an original zygote state.
- Lu et al. (2020), PMID **33268865**: visual recovery in mice after reprogramming. This outcome does not by itself demonstrate an archive-read mechanism.
- Saiz et al. (2020), PMID **32720894**: FGF4-mediated communication and lineage composition. This is not direct proof of a developmental archive.

The E5-inspired notebook asks whether a post-intervention state recovers a clone-private baseline rather than merely moving toward a population average. Suggested controls and alternative explanations are planning material; no experiment or new data analysis has run. Prepared assessments fit only the unchanged teaching sentences. An exact quote match verifies text, not the proposed mechanism, and citation/revision approval remains an explicit author action.

This sample uses `sampleVersion: "cellular-reversal-v1"`. Opening it preserves any earlier sample as a separate project, including the author's edits. Reopening the matching new sample preserves its edits too. The old three scenarios remain at indices 0–2 so saved reviews retain their original meaning; cellular scenarios are appended at indices 3–5.

## Bounded research agent

**Research check** opens the first bounded literature agent from Project tools or the Organizer/References workspace. It is a separate, consent-based tool; section conversations use their own bounded chat endpoint. Prepared examples remain network-free. No paid run starts from opening a page, loading the tutorial or opening the dialog.

The retained server integration supports a consent-based check of one question or short paragraph (2,000 characters maximum). Its OpenAI pipeline plans two Europe PMC searches, screens up to ten unique papers, optionally refines its search once, and reads selected abstracts or accessible full-text excerpts. It returns a research note and evidence cards. Every accepted quote is checked in plain code against retrieved text. Exact matching is not validation of a scientific inference; all AI interpretations await author review.

The request model is fixed to the currently documented `gpt-5.6-terra` identifier with standard service tier. The response must confirm that exact identifier and the default tier or the run stops with incomplete usage; no model fallback occurs. The official model page currently lists no distinct dated snapshot, so an alias behavior change is a reason to revalidate before activation. There are at most three model calls, three Europe PMC queries, and three selected full texts per run. Inputs, outputs, network response sizes, endpoints and run duration are bounded. No paid built-in tools, automatic retries, model fallback, background schedules, or experiment execution are enabled.

The current deployment is **connection pending** until the owner securely configures `OPENAI_API_KEY` as a hosted Sites secret and deliberately sets `PHEROGENT_AI_ENABLED=true`. A key saved in a local environment file does not configure the live host. No API key is accepted from the browser or committed to source. Once activated, anyone can run a check while the shared allowance remains; no approved email or account is required. Configure credentials with the OpenAI Developers secure key workflow and a supported Sites secret handoff. Use provider-side spending controls too; this app's limits cannot govern another application using the same account/key.


### Section conversations

`POST /api/agent/chat` handles Organizer, Data, Methods, Results, Figures, Title, Introduction, Discussion, Abstract, References and Review conversations. The server selects a fixed role from the section ID; visitors cannot supply system prompts, models or budgets. One turn uses one model call and the same permanent **40,000-token/$0.10 reservation** as a Research check. Both features compete for the same 2,000,000-token pool: fifty total accepted requests from a fresh ledger, not fifty per feature.

The user previews and consents to the exact message and context before sending. Context includes only bounded excerpts from the project brief, this section’s draft and conversation, and explicitly selected inputs. The full manuscript and other section conversations are not included automatically. Clipped context is disclosed. The server enforces message/context/body limits, validates strict JSON output, and stops on missing usage, unexpected model/pricing tier, timeout or malformed output. It never retries automatically.

Section replies can help plan analysis or write a draft; they do not execute code, analyze uploaded data, perform experiments, search literature or independently verify references. Those distinctions are in the server instructions and the UI. A generated draft stays a suggestion until the author explicitly applies it. Applying it preserves the prior section draft and clears review status; it never edits the manuscript or approves a citation. Replies, run records and activity stay bound to the originating project/section even if the author switches workspaces during the request.

The section endpoints are implemented, but **no live provider success is claimed while hosting lacks the key**. Mock-provider tests validate behavior without charging tokens.

### Chat layout and attachments

Agent workspaces open in a focused chat view. Draft and Context open on demand; the full research walkthrough still reveals prepared examples and the controls needed for practice.

The composer’s **+** opens an Add to message menu. Choose **Upload files**, **Add sources or notes**, or **File help**; merely opening the menu never opens the file picker. Arrow keys navigate, Escape closes and returns focus, and outside clicks close without discarding the message. The message field expands as you type, Shift+Enter adds a line, and Enter opens the existing consent preview (composition keystrokes never send). Assistant replies include **Copy** with success/failure feedback.

Attach files with **+ → Upload files** or drag them into the workspace. PDF, DOCX, PPTX, XLSX and common text/data/code files are read locally using pinned PDF.js and fflate assets. UTF-8, BOM-marked UTF-16 and conservative Windows-1252 text are supported. Limits are three files per message, 20 MB each, up to 20 PDF pages or 12,000 extracted characters per file, and 45 seconds to read. Recoverable PDFs retain readable pages and flag omitted/unreadable pages. Spreadsheets expose displayed/cached values; formulas and macros are never executed. Legacy .doc/.xls/.ppt and encrypted files need an exported/unlocked copy.

**Read scan** is an explicit local OCR action for PDF/PNG/JPEG: printed English only, first three PDF pages or one image, 60 seconds, one OCR job at a time, 12,000 characters. Pinned Tesseract 7 assets and the English language model are served from this site, without a CDN upload. OCR can misread scientific symbols, tables, handwriting and layout. Preview and correct the text. Oversized input images are rejected before decoding; rendered pages are scaled to bounded dimensions. This bounds work but cannot guarantee a fixed peak browser memory usage for every PDF. **Paste text** recovers a failed file with an explicitly author-provided, unverified passage. Raw retry files are held only in memory (up to three) and disappear on reload. File reading/OCR do not call the AI provider or consume the shared token allowance.

Preview, edit the relevant excerpt, or remove any attachment before sending. All attachment excerpts share at most 4,204 characters of the existing 6,000-character context, with the remainder for the current section. The consent dialog shows the exact outgoing text and each partial excerpt. Raw files are never sent to the model. Pending attachments are in-memory and clear on reload; sent bounded excerpts and names join the author message, project exports and run provenance. Extraction/OCR limitations accompany the outgoing excerpts. The AI receives no missing pages, charts, images or formatting, and is instructed not to claim otherwise. Existing model, consent, input/output, concurrency and spending limits are unchanged.

Manual QA: attach a readable PDF and DOCX, inspect Preview, remove a card, and open Send. Confirm exact excerpts appear before consent. Switch agent/project during extraction and verify files stay scoped to their origin. Check Draft/Context open and close, and try the prepared full research walkthrough. Reader tests use actual PDF/DOCX fixtures; UI tests cover pending-file races, stale consent, clipping, failures and provenance without paid provider calls.

### Spending controls

A durable D1 ledger atomically reserves **40,000 combined input/output tokens and $0.10 before every run**. The entire public website shares **2,000,000 tokens with no automatic refill**: at most fifty runs from a fresh ledger. Every existing ledger row also counts as 40,000 reserved tokens, so deployment cannot erase old usage. Increasing the pool from 200,000 to 2,000,000 preserves the five existing reservations and adds 45 attempts; it does not reset daily or per-visitor limits. The conservative token reservation is deliberately not refunded when a run uses fewer tokens. Reservations are never refunded, including failures, timeouts and cancellation. They are conservative allowance accounting, not a claim that every run actually costs ten cents.

- **$1 globally per UTC day**, **$10 lifetime starter allowance**. Changing browsers, signing in as another visitor or restarting the server cannot reset these limits.
- Three combined chat/research runs per visitor bucket per UTC day; one-minute cooldown; one active run per visitor and two across the site.
- At most 90 seconds, three model calls, three queries and ten papers. Same request ID cannot run twice.
- The pipeline checks cumulative conservative input/output token and cost bounds before each model request. Input bounds include full serialized request size plus protocol allowance; output caps include reasoning tokens. No provider call occurs if its bound would exceed 40,000 tokens or the run's monetary reservation. These conservative bounds depend on the provider honoring its documented output limit and token accounting; a mismatch stops further calls.
- Uncertain API usage is labeled incomplete. Cancellation stops further work but cannot guarantee a previously submitted call won't be billed.
- Key missing, disabled switch, ledger failure, malformed request, exhausted allowance, or stale pricing means **no paid call**. Pricing must be reviewed before November 24, 2026; it expires automatically then. Prices were checked at https://developers.openai.com/api/docs/models/gpt-5.6-terra .

The header uses provider-reported tokens; prepared tutorial actions and manual search do not increment it. Conservative estimated model cost is separate from the allowance reserved. New runs price all reported input tokens at the highest documented cache-write rate ($2.50 per million), without discounts, and output at $12 per million. This is an upper estimate under the verified standard rates, not a provider invoice. Unresolved ledger rows retain their reservations and show usage as incomplete. No live provider execution is claimed until a key is connected and an actual check succeeds.

## Working capabilities and limits

The existing manual Europe PMC search, prepared tutorial, project notebook, manuscript, exact quote matcher, author approval/undo and exports remain available without AI access. AI requires per-run consent and a first-party visitor cookie or existing signed-in identity; the rest of the public site stays public. The cookie is a rate-limit bucket, not authentication. Clearing it can evade per-browser fairness limits and consume the pool sooner, but cannot increase the shared token or dollar allowance. There is no automatic manuscript editing, exhaustive review, autonomous experiment, recursive citation tracer or retraction guarantee.

## Persistence and privacy

All projects remain browser-local under the existing `pherogent-evidence-workspace-v2` key. State stays version 2; `productVersion: 1` and `studioLayoutVersion: 1` migrate the interface without dropping the draft, sources, decisions, Activity, original demo decisions or legacy recovery data. Each project's `research.agentWorkspace` holds its own agent conversations, inputs, outputs and tour progress. Inactive projects are independent snapshots. Evidence-tutorial progress records the practice project, return project and current mission separately. Malformed project records are preserved in `projectRecovery`; malformed research and tutorial fields are retained in recovery data. Exported backups include the active project, inactive project snapshots and tutorial progress.

Project content and results remain local to this browser. Anonymous visitors receive a validated random UUID in a `__Host-pherogent-visitor` cookie (`Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, one-year maximum age). Signed-in visitors retain their existing usage history. The server ledger stores visitor/run identifiers, timestamps, reserved allowance and usage, not manuscripts or research results. Opening status establishes an anonymous cookie before a POST may start paid work; missing or malformed cookies must refresh the connection before retrying. The public status endpoint reports shared allowance and only the current visitor’s usage, without listing identities. Selected question text and retrieved passages are sent to OpenAI only after consent; planned or manually submitted search queries go to Europe PMC; those queries can contain sensitive text if the author puts it there. Paper links open external sites. Export copies before clearing browser data or moving devices. A JSON export is a backup artifact; an in-app backup restore UI is not implemented.

## Development

The client source is in `public/`, with the HTML entry in `app/workspace.html`. `studio-data.js` defines stage data, prepared examples and state normalization; `studio.js` provides the agent UI and `studio.css` its responsive layout. `research-map.js` organizes the sections, `research-tour.js` manages the full practice workflow, and `meter.js` renders actual/illustrative usage. `app.js` bridges these modules to existing projects, manuscript and exports. A Vinext route serves the workspace and `/api/agent/status` plus `/api/check-claim` use `server/api.mjs`. `server/research.mjs` handles literature/model work; `server/budget.mjs` owns the durable spending controls. `db/schema.ts` and committed Drizzle migrations define the ledger. `.openai/hosting.json` retains the existing Site ID and declares `DB`; `dist/` is generated build output.

Client data still uses `pherogent-evidence-workspace-v2`. `public/cell-demo.js` supplies the versioned cellular sample; the optional tutorial remains independent of AI. `public/agent.js` records results in the originating local project, and saving notes/sources does not approve citations.

Install via the Sites dependency helper or the repository's pnpm setup. Build through the Sites build helper. Generate schema changes with `npm run db:generate`; apply migrations locally through the documented Sites D1 workflow. Production migrations apply during publication. Never delete/reset the ledger to restore spending allowance.

```sh
npm test
```

The original four Node suites cover API input/response handling, scientific sentence boundaries, quote/approval gating, undo and offsets, recovery, project independence, old/new sample-version preservation, unchanged legacy scenarios, task state, source notes, exports, cancelled searches and HTML escaping. Tutorial tests additionally cover action-based progress, pause/reload state, prepared provenance, project isolation, unchanged teaching-sentence requirements, and the absence of automatic search or approval.

Additional Node tests exercise model/paper/schema limits, fabricated quotes, unknown usage, authorization, cancellation, idempotency and actual SQLite concurrency races for the last dollar and token reservations, persistence across restart and midnight, and anonymous cookie idempotency. They use mock provider responses and do not spend API tokens.

Studio tests cover stage/project isolation, local custom-message handling with no network, HTML escaping, prepared provenance, review invalidation, explicit insertion/handoff confirmation and immutable handoff copies. Integration tests load the actual app and studio together, migrate a saved v2 workspace with citation decisions and source notes, switch projects and reload, and verify append/undo refuses to overwrite unrelated manuscript edits.

Map tests cover complete section grouping, author-derived progress, escaped untrusted text, local navigation, persisted layout/collapse and question editing. App integration checks map-to-workspace actions, prior citation validity after append-only insertion, stale pre-existing edits, and separation between illustrative meter data and actual usage. New section text is not automatically assigned claims or approved citations.

The full-tour integration drives all 14 steps through real app action handlers, including source attachment, reviewed handoff, append-only manuscript insertion, author citation approval and download. It pauses/reloads/resumes mid-tour and verifies the original project's writing and notes are unchanged. Meter tests additionally cover unknown usage, allowance scope, CSV safety and fictitious-versus-actual separation. These Node tests do not establish visual layout or live provider availability.

For conventional browser tests on a development machine:

```sh
pnpm install
pnpm exec playwright install chromium
npm run test:browser
```

The CLI uses a fixed Europe PMC fixture. `PHEROGENT_TEST_URL` can point to an existing test server. Thirteen shared scenarios also run through the managed browser adapter: six manual research/evidence regressions, two evidence tutorials, three studio flows and two map flows. They cover focus, project isolation, reviewed insertion, copied handoffs, map state and Europe PMC source checks for PMID 33268865. Run them against the deployed build or a development server; the CLI fixture tests do not establish live API availability.

## Hand check: agent studio

Start on **Research workflow**. Click each of the four phases and select a workspace; the inspector should show that workspace’s actual saved output and context. Use Continue from here to cross phases, return to a prior phase, and confirm its selection is remembered. Try Drafts to review on a phase with no drafts and follow the link to a draft elsewhere. Reload and switch projects to verify selections remain isolated. Old Graph/Outline preferences should open the new workflow without changing content or approvals. Evidence review, Source library and Open manuscript navigate without changing the research. A prepared output remains Draft until you explicitly mark it reviewed in its workspace.

1. Create a project. Open **Methods**, type a custom message and choose Send. Confirm a consent preview appears. If AI is unconfigured, sending stays disabled, the composer is preserved, and no assistant reply or token usage is invented. Switch to **Results** and back; each chat and unsent composer should stay separate. Reload and check persistence.
2. Choose an example prompt. Confirm the reply/output says prepared and no analysis ran. Edit its title, click into the output body and type; focus must remain in the body.
3. Confirm **Add to manuscript** is unavailable until **Mark reviewed**. Edit again and confirm review is cleared. Review, add, inspect the confirmation and confirm insertion; existing manuscript text and citation decisions must remain.
4. Use **Undo addition** before further manuscript edits and confirm the exact previous text returns. Add again, edit the manuscript directly, then try undo; it must refuse to discard the newer edit.
5. Review a Results output and **Pass to another agent → Discussion**. In Discussion's **Context**, inspect the reviewed copy. Edit the original Results output and confirm Discussion's copy stays unchanged.
6. Add a source or local note to one agent. Check other agents do not receive it automatically. Switch projects and confirm chats, inputs and outputs remain separate.
7. Try **Workspace tour**, pause/close it, and keep using the product. At a narrow mobile width, check the navigation drawer and **Chat / Output / Context** tabs.
8. Open **Usage & budget**. Inspect Actual usage, switch to Illustrative demo, then return to Actual usage. The demo must be clearly fictitious and must not create actual runs, token charges or allowance changes. Unreported usage/remaining budget must not be presented as confirmed.

## Hand check: full research walkthrough

1. Start with a personal project containing distinctive writing. On Research workflow choose **Walkthrough**. Dismiss the invitation once and confirm the active project is unchanged; reopen it and choose **Start or resume practice**.
2. Follow the coach through the section workspaces. Before each action, confirm **Continue** is disabled. Add a Data source, load prepared outputs, review Methods and pass a reviewed Results copy to Discussion.
3. Pause midway, reload and resume. Confirm the same practice step and outputs return. Use Back or Skip once and check that the route distinguishes completed from skipped actions.
4. Review Abstract, confirm **Add to manuscript**, then inspect Manuscript. Existing text stays intact. In Evidence review approve the prepared lineage claim explicitly; no other citation should be approved by the tour.
5. Review the final checklist and open Export. Merely opening it must not finish the tour; download an artifact to complete that action.
6. Switch to the personal project. Its manuscript, sources and evidence decisions must be unchanged. The usage counter must not have increased from these prepared actions.

## Hand check: tutorial

1. Create a personal project and write a distinctive sentence. Open **Help → Practice evidence review** and confirm a separate practice project is active.
2. Continue to **Find evidence**. Confirm the query is filled but there are no search results until **Search papers** is clicked. Inspect and save the returned paper. Alternatively, choose **Use prepared paper instead** and confirm its prepared label.
3. Write or insert a reading note. Confirm the mission remains incomplete until **Add note to notebook** is clicked.
4. Insert the example claim, then click **Prepare sentences for review** once. Confirm the sentence appears and the guide can continue.
5. Insert the prepared passage/review or enter them manually. Confirm the exact-match result appears, but the manuscript still has no approved citation. Inspect the archive-mechanism limitation: the quote supports a mouse visual outcome, but does not prove retrieval of a stored cellular history. The suggested wording must omit the archive claim.
6. Choose **Apply wording + citation** yourself. Complete the guide, choose **Return to my project**, and confirm the personal sentence is unchanged.
7. Start the evidence tutorial, pause it, reload and resume. Confirm the saved mission returns without automatically searching or approving anything. Switch projects while the guide is active and confirm it pauses.
8. Open **Export → Preview manuscript**. Compare the visible Markdown with the approved wording and citations; select and copy it or use the download action.

## Hand check: independent research

1. Choose **Open sample project**. Confirm the Cellular Blockchain/reversal question, three proposed mechanisms, source notes and proposed E5 experiment are clearly distinguished from established findings. In an agent's **Context → Edit research brief**, edit its question. **Back to workspace** opens the original task list.
2. Choose **New project**, enter a name/question and create it. Follow the same research-brief route to add a task; navigate away and back to confirm it remains.
3. Search in **Library**, inspect and save a paper. Add a source note, change its reading status, and choose **Add note to notebook**. Confirm no citation is approved automatically.
4. Write in **Manuscript**, insert an outline, then append notebook notes. Existing writing must remain. Click **Prepare sentences for review** once.
5. In **Evidence review**, explicitly choose a saved source, paste an exact passage and record an assessment. Approve then undo; numbering and original text must recover.
6. Switch to the sample and edit it. Switch back and reload. The personal project’s text, notes, sources, tasks and decisions must remain separate. Reopen the sample to confirm its edits persist too.
7. If an earlier reprogramming sample already exists, opening the new sample must leave it available in the project switcher with its old edits intact. Opening the new sample again must return to the edited new project.
8. Open **Help**, choose **Explore on my own**, and reload. The welcome dialog should not reappear automatically. Export a project or the full workspace from **Export**.

The unrelated original `pherogent-workspace.drjichoi.chatgpt.site` Site is not modified.

## Lee 2014 study explorer

**Project tools → Study explorer** opens a read-only reconstruction from the public Lee et al. supplementary workbook. Change the tolerance or sampling schedule to recompute regional counts locally, inspect original cell values, and download the six frozen CSVs and verification JSON. This feature uses no model API calls. The known report-rounding discrepancy and unavailable original archive are displayed explicitly.

See [the study explorer documentation](docs/lee-study-explorer.md) for data provenance, manual checks, and scope. The proposed validated manifests, typed agent tools, claim gate, and evaluation runner are not part of this release.

## Design references

The research map adapts connected-card organization from [Obsidian Canvas](https://obsidian.md/help/plugins/canvas), author-action progress from [Linear milestones](https://linear.app/docs/project-milestones), and optional contextual guidance from [Fluent onboarding](https://fluent2.microsoft.design/onboarding). The user's [Agent Meter reference](https://agent-meter-jungin.drjichoi.chatgpt.site/#overview) informed the usage dashboard layout. These are design references; they do not imply any integration with those products.

## Hand check: bounded AI

The launcher works without credentials; paid end-to-end validation requires secure activation. This release was tested with mock provider responses and no paid API requests.

1. Open **Research check**. With no secret configured, confirm connection pending and a disabled paid-run button; manual search and the prepared tutorial still work.
2. After secure setup, open a fresh browser session without signing in. Read the 2,000,000-token shared pool, 40,000-token reservation per run and monetary backups. Confirm unchecked consent blocks a run and opening the dialog spends no tokens.
3. Submit a short research question. Observe genuine step events and reported usage. Do not expect simulated token animation.
4. Review source access, quote location and limitations. Save findings or sources explicitly; confirm the manuscript has no automatically approved citation.
5. Cancel a run; confirm its 40,000-token/$0.10 reservation remains consumed while actual reported tokens are separate. Repeated/duplicate requests and concurrent users must not bypass the ledger. After fifty total runs, a fresh browser and the next UTC day must still show zero shared token allowance and a disabled run button. Use mocked tests for these checks rather than spending real tokens just to exhaust the pool.
6. Switch projects during/after a run and confirm results stay with their originating project. Export project notes and Activity for provenance.


## Public demo activation

The hosted Site was activated and a paid smoke test succeeded in v17. Later attachment/MCP changes use fixture-based tests without paid AI requests. Hosted secrets and the enabled flag remain in Sites environment settings, never in browser code or this repository. Installing ChatGPT locally does not configure the server. The setup instructions below apply when activating a new deployment; do not reset existing reservations or assume local environment files are the hosted configuration.


1. Use the OpenAI Developers secure key workflow. Keep a dedicated OpenAI project/key for Pherogent; do not paste credentials into chat or website forms. Installing ChatGPT on a Mac does not configure this server credential.
2. In the provider project’s **Limits → Spend**, set a small monthly limit (for example $10) and enable **Enforce a hard limit**, not just an alert. OpenAI documents possible small overshoot while enforcement propagates. This is a second control; it does not replace the app’s pre-request ledger or cover hosting fees.
3. Set `OPENAI_API_KEY` as a hosted Sites secret through a supported secure handoff. Keep `PHEROGENT_AI_ENABLED=false` until it is ready. No email allowlist is needed. Never print the local key to copy it through chat or tool output, commit it, or reset the D1 ledger to restore allowance. If the tooling cannot securely import the local key, report that blocker and leave the connection off.
4. Turn on `PHEROGENT_AI_ENABLED` and redeploy the saved version. Run one deliberately approved smoke test using public/non-sensitive question text. Confirm the returned model, steps, matched quote, usage and persistent reservation before telling visitors the AI connection works. This consumes one of the fifty shared reservations.
5. To stop new runs, set `PHEROGENT_AI_ENABLED=false` and redeploy. This does not undo submitted calls; the per-run bounds still apply to work already accepted.

Official references verified October 24, 2026: [model/pricing](https://developers.openai.com/api/docs/models/gpt-5.6-terra), [provider hard spend limits](https://developers.openai.com/api/docs/guides/spend-limits), [per-run budget controller](https://developers.openai.com/cookbook/articles/per_run_spending_controller_responses_api). Failures, invalid outputs and scientific errors remain possible; the controls limit work and require author review rather than promising perfect research.

## Hand check: section chat

1. Open a section, type a request and select Send. Inspect the exact outgoing text and context. Cancel and confirm no message was sent and your composer text remains.
2. While the server is unconfigured, confirm the send-to-AI button stays disabled even after consent. Prepared example buttons must still work without a paid request.
3. After secure hosting activation, consent to one short, non-sensitive request. Confirm one genuine AI reply, reported usage and one shared reservation; do not exhaust the shared pool with live runs merely to test exhaustion.
4. Leave the section or switch projects during a simulated delayed request. Its reply and activity must stay in the original project/section.
5. Review a suggested draft, edit the existing output, and confirm a stale approval cannot overwrite the newer edit. Applying a current suggestion must preserve history and leave manuscript/citations unchanged.
6. Inspect Usage & budget and exports. They must separate prepared examples, AI replies, reservations and unknown usage. Research check history must not treat a section conversation as evidence cards.


## MCP connector

The `mcp` hosting capability exposes stateless MCP 2026-07-28 at `POST /mcp`. Sites provisions the owner's private plugin during publishing; use that integration rather than a manually created unauthenticated client. **Connections** explains access from the app.

- `search_papers`: at most five Europe PMC paper summaries/abstract excerpts.
- `read_paper`: one verified MED/PMC identifier, abstract and up to three open-access body excerpts. Focus uses simple term overlap, not AI; full-paper review is never implied.
- `verify_quote`: literal case/whitespace-sensitive substring match against caller-supplied text. It does not establish provenance or scientific support.

Tool calls require Sites' authenticated user header. Discovery/listing expose only public metadata. The server never reads browser-local drafts or raw attachments, never calls OpenAI, and never changes manuscripts. Source queries go to Europe PMC. Fixed hosts, no redirects, strict schemas, bounded streams/timeouts and a separate D1 reservation ledger limit access to 60 source requests/user/UTC day and 500/site/day. Search reserves one; reading reserves two; failed/unused reservations remain. Existing AI budgets are untouched. ChatGPT/client token usage follows that client's own account limits.

Validation: `npm test` includes actual PDF parsing, compressed Office fixtures, real Tesseract worker recognition and real Workers/D1 concurrent MCP quota checks. `npm run vendor:attachments` reproduces pinned browser assets. Browser hand checks: attach a scan, choose Read scan and inspect OCR text; try XLSX/PPTX/UTF-16 files; recover an unsupported file through Paste text; remove a running OCR job; inspect exact consent context without submitting a paid run. The user's specific failing document is still required to diagnose any remaining file-specific error.

## Study workflows

The live Study workflows view adds two isolated supplied-summary vector collections, a bounded LangGraph JS retrieval workflow, and three descriptive calculation Skills demonstrated on the full Lee dataset. Searches and local calculations use no AI tokens. An explicit handoff can stage summaries in the existing consented, budgeted References chat. See [the integration, limits and manual checks](docs/study-workflows.md) and [the Skills contracts](docs/research-skills-contract.md). Lu/WIF1 primary matrices are not included; numerical reanalysis remains NOT_RUN for those collections.

## Connected research workspace (November 2026)

The main navigation and map now organize the existing tools into Sources, Checks,
Analyses, and Outputs. The current project's paper contains its section chats and
drafts; other projects keep separate papers and context. The map reads saved work,
not an AI-generated progress estimate, and never starts a calculation or model call.

Outputs supports browser-local technical reports and dataset records (descriptions
and source links, not hosted databases). A saved study run can become a report with
an unchanged source snapshot. Authors review a record before linking a versioned
copy to one section. The handoff verifies the active project and persisted reviewed
revision, rejects duplicate copies, and leaves manuscript text unchanged. Editing
or repairing a reviewed record resets its review status. Later report edits do not
silently update linked snapshots. JSON backups retain the records; report and
research Markdown exports include provenance.

Source-summary workflows explicitly label numerical branches as skipped when the
study matrix is absent. Saved source and calculation records reopen with their
project. No AI endpoint, model, API key, rate limit, or spending cap was changed.

Manual verification:
1. Open Research workflow and select each stage; inspect inputs, saved status, and actions.
2. Under Checks, open Check study design; the existing local checker should open.
3. Run the free Lee calculation in Study analyses, then open All outputs and save its run as a report.
4. Save and mark the report reviewed, link it to Results, and inspect its saved version in Context.
5. Edit the report: its status returns to Draft and the linked earlier version remains a labeled copy.
6. Switch projects and reload; drafts, reports, citations, and context stay with their original project.

Validation: `npm test` includes existing regression suites and new map, navigation,
output persistence/review/export, run-restoration, and application handoff tests.
Browser QA covered the map, output creation/review/linking, context display, and the
study-design shortcut without paid model requests. Screenshot: `docs/qa/workflow-v31.jpg`.

## Data and results

Open **Analyses → Data & results** to connect local CSV/TSV measurements or use the real Lee example, inspect eligible tools, run descriptive calculations and technical checks, and save a result for author review. Raw uploads stay in browser memory; compact runs and reviewed output snapshots stay with the local project. See [the input contract and limitations](docs/data-analysis.md). No AI call is required.
