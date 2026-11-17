# Data and results workspace

Open **Analyses → Data & results** or `/#data-analysis`.

This workspace connects declared measurement data to existing deterministic descriptive tools, records their checks, and lets the author save and review an output before using it in a paper section. It makes no AI requests and does not change provider credentials, consent, token reservations, or spending caps.

## Supported inputs

- A CSV or TSV in long format, with `sample_id,unit_id,time,feature,value` headers.
- Explicit study, route, population, assay, observation unit, sampling relation, and independent-unit information supplied by the author.
- The public Lee 2014 reconstruction already included in the website, as a real worked example.
- A separately labeled synthetic template for learning the input format.

Uploaded files are processed in browser memory. Raw measurements are not uploaded or stored in project localStorage. Compact completed run records are saved with the project; reselect a raw file after reloading or switching projects. A SHA-256 fingerprint identifies uploaded file bytes, not the scientific authenticity of the source. Declared metadata is not independently verified.

Blank or NA values indicate missing measurements, not zero. Include blank-value rows for planned but unobserved time points so they remain in the schedule. A missing endpoint does not yield an inferred value. Samples from different units are not silently paired. The importer does not normalize assays or prepare raw sequencing files.

## Calculations and checks

The three descriptive tools are EpiState-T state representation, interval rollup, and observed transition. They use the existing `PherogentResearchSkills` implementation. They operate over all eligible input rows, retain missingness and source locators, and keep exact equality separate from being within tolerance. DNAm, RNA, and ATAC are separate measurement types.

The checks cover input structure, declared sample mapping, source locations, missingness, and calculation eligibility. A completed check is not a universal scientific claim gate. These calculations do not establish a same-cell trajectory, a biological memory mechanism, causal effects, or statistical significance. An unknown independent-unit count stays unknown. Age clocks, identity-marker scoring, and predictive mechanism ablation remain proposed and cannot be launched from this workspace.

## Outputs and review

Runs retain their numerical results, settings, check decisions, limitations, and source identity. The Outputs workspace can save a report with a separate source snapshot. Author edits reset report review. Only an explicitly reviewed revision can be linked to a paper section; linking neither submits an AI request nor inserts text into the manuscript. Source-reported findings, computed results, synthetic software tests, and proposed analyses retain different labels.

## Validation

`npm test` includes parser and numeric failure cases, real Lee calculation parity through the existing skills tests, UI state and project isolation checks, output provenance tests, and application integration checks. None of these tests call a paid model. Browser checks exercise the real Lee example and a synthetic input through the same product controls.
