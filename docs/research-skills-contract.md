# Descriptive research skills

The live study workflow uses `public/research-skills.js`. It makes no network or model calls and edits no manuscript. The browser global is `PherogentResearchSkills`; the same implementation exposes a CommonJS adapter for isolated Node tests.

This is a JavaScript implementation of the supplied tensor and interval contracts. **It is not the Python EpiState-T package executing in the browser.** The third skill computes an observed transition; it does not train the proposed M0/MH/MG/MHG predictors or establish a historical-memory mechanism. The supplied Python package's `mechanism_ablation()` remains outside this integration.

## Inputs and outputs

| Function | Input | Output |
| --- | --- | --- |
| `epistateTensor(input)` | Declared unit, time and feature axes; assay; study/route/population metadata; observations with source locators | `Z[unit][time][feature]`, boolean mask, source locators, shape and observed-value counts |
| `fromLeeData(data, {route})` | The existing complete Lee 2014 dataset and one of its four source routes | A tensor built through `epistateTensor`, using every one of the 7,890 regions on each included source profile |
| `intervalRollup(tensor)` | A validated tensor | Ordered records for consecutive declared visits, observed-pair counts, missingness, mean signed/absolute differences and compact source locators |
| `epistateTransition(tensor, {from, to, epsilon})` | Consecutive route visits and tolerance 0.02, 0.05 or 0.10; omitted visits default to the last interval | Counts within tolerance, increased/decreased beyond tolerance, exactly equal, means and provenance |
| `inspectValue(tensor, {unit, time, feature})` | One declared coordinate | Exact input value, observation status and its source locator |

Metadata names the study, route and population and declares `observationUnit`, `independentUnits`, `destructiveSampling`, `lineage`, and `featuresAreReplicates: false`. An optional `approximateTimes` list preserves uncertain time labels. The Lee tensor uses one **population-profile axis**, never one independent mouse/cell; independent units remain unknown. Its approximate final visit is stored as time 30 with an explicit approximate flag.

The generic tensor constructor validates an author's declared structure. It does not authenticate an uploaded study design or prove an observation came from its stated file. The Lee adapter additionally uses the existing Lee source-layout validator; every subsequent skill checks canonical route assignments, sample IDs, columns, rows and full feature coverage. Source files themselves are frozen and hash-tested separately by the existing Lee suite.

## Missingness, calculations and provenance

Unobserved entries have `Z = null`, `mask = false` and no source locator. Zero is an observed numeric value, not missingness. Only features observed at **both** interval endpoints enter a difference. No imputation, interpolation, cross-route borrowing or retrieved-row filtering occurs. A rollup with no observed pairs reports `NO_PAIRED_OBSERVATIONS` and null means. A specifically requested transition with no paired observations refuses the request.

For each eligible feature, `delta = later − earlier`. Increased/decreased counts require `delta > epsilon` or `delta < −epsilon`. Within tolerance uses `|delta| <= epsilon`; exact equality is counted separately. These are observed-profile differences, not same-cell return, predictive accuracy or causal effects. No significance test treats CpGs or regions as biological replicates.

Per-value source locators remain in the tensor and can be inspected exactly. Aggregate outputs group locators by file, sheet, column and sample ID and report feature count and row bounds. For a generic sparse tensor, bounds may span omitted rows; they are not a claim that every row in the span was eligible. The Lee adapter always uses all 7,890 rows, 4–7893, for each included source profile. Export compact summaries rather than the large `Z`, mask and per-value source arrays.

The rollup's `sequence` and `previousSequence` record computation order only. There is no cryptographic chain, consensus system or claim about storage inside cells. No hashes are invented.

## Refusals

| Case | Example | Code |
| --- | --- | --- |
| Invalid time order | Times `[4, 2, 0]` | `invalid_time_order` |
| Duplicate coordinate | Two values for one unit/time/feature | `duplicate_observation` |
| Unsupported assay | `DNAm_typo` | `invalid_modality` |
| Invalid measurement | NaN for RNA or DNAm 1.01 | `non_finite_value` / `invalid_fraction` |
| Mask bypass | A numeric value marked unobserved | `mask_value_mismatch` |
| Altered shape | Mask missing one feature column | `shape_mismatch` |
| Missing source | Observed value with no source locator | `invalid_source` |
| Reused sample | The same sample ID stands for two visits | `reused_sample` |
| False replication | Treating 859,151 features as independent units | `features_are_not_replicates` / `unknown_independence` |
| False lineage | Destructive sampling declared as same-cell tracking | `incompatible_lineage` |
| Nonconsecutive interval | Day 0 to day 4 when day 2 lies between | `nonconsecutive_interval` |
| Missing route slot | Day 16 on Lee withdrawal | `missing_route_slot` |
| Wrong Lee assignment | Relabel continued low as withdrawal | `invalid_lee_schedule` |
| Wrong Lee source cell | Give D21L as a withdrawal endpoint | `invalid_lee_locator` |
| Filtered Lee profile | Hide a source region through the mask | `invalid_lee_mask` |
| Empty interval | No features observed at both endpoints | `no_paired_observations` |
| Excessive size | More than 200,000 tensor slots | `size_limit` |
| Arithmetic overflow | Finite RNA endpoints produce an infinite difference | `numeric_overflow` |

## Validation

Run `node --test tests/research-skills.test.cjs`. The tests include the negative cases above, zero/missing-mask behavior, optional metadata, strict tolerance boundaries, source precision, all four real Lee routes, and every archived `increments.csv` row. Floating aggregate means are compared within `1e-14` to allow summation-order differences from the archived Python outputs; discrete counts match exactly. The existing byte-identity and Lee path-class tests remain unchanged. No test calls a paid model.
