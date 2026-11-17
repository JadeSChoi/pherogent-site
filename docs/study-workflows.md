# Study workflows

Pherogent retains its manuscript, chat, evidence review, Lee explorer, local projects and existing AI spending controls. **Study workflows** adds two isolated retrieval collections and three deterministic descriptive Skills. Open `/#study-workflows`.

## What runs

The attached Python scaffold is deliberately ported to JavaScript for the site's existing Cloudflare Worker. The site runs **LangGraph JS**, not the Python process and not an external LangGraph hosting service. Its four bounded nodes select an explicit collection, rank source summaries, check numerical data availability and check record provenance. It makes **zero model calls**. This is a predefined workflow, not an autonomous researcher.

| Collection | Contents | Available calculation data |
| --- | --- | --- |
| RAG1 · Lu 2020 | Six supplied source-summary records | None in the supplied package |
| RAG2 · GSE293381 | Seven supplied source-summary records | None in the supplied package |

Each collection retains the original SQLite vector database and source-note JSONL. The Worker reads an immutable JSON export of the same float32 document vectors; it does not query SQLite directly. These are **TF–IDF lexical vectors**, not neural embeddings. `scripts/build-study-indexes.py` checks that rebuilding vectors matches the supplied SQLite arrays before creating the runtime exports. Source locators identify the package record and JSONL line, not a page or passage in a paper. No raw matrix, full paper or independently verified quotation is claimed. Empty and zero-score results cannot pass the record check.

The author can stage retrieved summaries in References chat. Nothing is sent to the model until the author reviews and confirms the existing consent dialog. This optional generation step uses the existing provider, durable reservations and shared spending limits. The unverified summaries are labeled as such in the context. AI output remains a suggestion; it does not approve citations or edit the manuscript.

## Three Skills

The separate **Lee 2014 calculation example** uses all 7,890 workbook regions. No retrieved subset is used for arithmetic. It operates locally in the browser, so it does not consume the AI allowance.

1. **EpiState-T state tensor:** a descriptive JavaScript implementation of ordered values, observation mask and source locators. It is not the Python EpiState-T v1.1.0 package executing on the server.
2. **Rollup Sequencer:** ordered, adjacent observed intervals, masks, numerical summaries and provenance. These are computational records, not a biological blockchain or an append-only consensus ledger.
3. **EpiState transition:** observed adjacent differences and tolerance classifications. “Within tolerance” is separate from exact equality. It is not a fitted predictor and does not implement the scaffold's M0/MH/MG mechanism-ablation experiment.

See `research-skills-contract.md` for input contracts and refusal cases. Calculations are descriptive; source profiles are not counted as independent biological replicates. Missing Lu and WIF1 matrices leave all three Skills at `NOT_RUN` for those collections. Raw data, verified biological-unit mappings, modality-specific processing and a separately tested predictive analysis are required before that changes.

## Audit and limits

Retrieval accepts one explicit collection and a question of up to 2,000 characters, returns at most five matching records, and runs a four-node graph without retries. The endpoint accepts same-origin JSON only, bounds body size and graph steps, and has an eight-second processing timeout. It has no API key input and cannot select a model or invoke arbitrary tools. No drafts are read automatically. A submitted search question is sent to the site server, not an AI provider.

Completed runs add an honest System entry to Activity. The latest five compact run snapshots are retained with the project and included in the JSON review-log/backup export; each run can also be downloaded directly. Drafts, source approvals and undo state remain unchanged.

## Verification and manual checks

Run `npm test`. New suites cover vector/SQLite parity, zero-score abstention, collection isolation, real no-network LangGraph execution, HTTP bounds, cancellation, skills input refusals, full-data arithmetic and UI integration. Scientific accuracy has not been benchmarked on a held-out question set.

1. Open Study workflows; choose Lu 2020 and search for OSK. Inspect the source links and package locators. Confirm summaries are not labeled verified quotations.
2. Select GSE293381 and search for WIF1 ATAC. Confirm the collection stays separate and numerical analysis is `NOT_RUN`.
3. Search for an out-of-vocabulary string. Confirm an empty result, not a made-up answer.
4. Run the Lee calculation example. Change route and tolerance; confirm full-row counts, missingness and source locators are present.
5. Use the explicit References-chat handoff. Confirm context appears but no AI message is submitted. The ordinary send/consent process remains necessary.
6. Inspect Activity and export the run. Reload; confirm existing manuscript text and approvals are preserved. Open the original Study explorer and repeat a Lee calculation.

## Release verification

The full existing test command passed. The new additions contribute 46 passing tests (8 retrieval, 8 workflow/integration, 19 Skills, 11 UI). The final project-switch UI changes were rechecked with the workflow suite. Browser checks exercised both source collections, the real Lee calculation, Activity entries and References context staging without submitting an AI request. All 22 archived Lee intervals match discrete counts exactly and aggregate means within `1e-14`. No paid model calls were made during development or verification.
