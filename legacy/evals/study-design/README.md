# Same-cell check: development cases and paired replay

This is a free, offline check of one study-design prerequisite. When a manuscript states that the same individual cells recovered, the source must describe a design that can follow those cells. The check is not a general detector of recovery, a substitute for an exact quote or evidence that an agent is scientifically accurate. A compatible study design does not establish a change in any cell.

## Check the rule itself

From the repository root:

```sh
node evals/study-design/score.cjs check
node --test evals/study-design/score.test.cjs
```

The 12 short passages in `packets.json` are **illustrative examples authored for development**. They are not quoted literature, blind test data, or independent biological observations. The examples include direct tracking, repeated donors, an unreported design, group-level findings, explicit negation, cell type, clone identity and mixed designs. The locked `key.json` specifies the expected design outcome and whether the supplied packet supports the claim. Inspect disagreements rather than changing the key to match the software. Passing these cases is a regression check, not a measured improvement over an LLM.

## Compare written rules with enforcement of the same rule

1. Freeze `packets.json`, `key.json` and `prompt.txt` before sampling. Show only the prompt and packets to the model. Keep the key, evaluator, and software output out of its context.
2. Save the raw JSON array of judgments and reasons as returned. Record model, settings, date, and packet/prompt hashes; retain refusals and missing outputs. Do not select favorable runs.
3. Run `node evals/study-design/score.cjs replay saved-outputs.json`. Each packet is scored twice: **written rules** uses the original model judgment, and **executed rules** applies the product’s study-design rule to that same proposal and source. The paired readout measures whether positive labels remain eligible, not the effects of a new prompt, a second model run, or the whole production pipeline (retrieval, quote verification, numerical analysis and author approval are outside this replay). A blocked endorsement is represented in this scoreboard as indeterminate; this is an abstention, not scientific contradiction.
4. Inspect the reasons yourself. A correct label can have an incorrect explanation. The scorer checks that a reason is present, not that the reason is scientifically sound.

Under unsupported claims, **supports** and **partial** count as endorsements. A premature **contradicts** is reported separately. Missing/invalid output is retained in the denominator and also counted in the conservative *endorsements or failures* total. For answerable claims here, only an explicit **supports** for the full sentence earns label credit; refusals, partial answers and failures cannot earn credit. This preserves the cost of inappropriate blocking. The tool prints both outcomes per packet so a real improvement or regression can be inspected.

For a no-model illustration, run `node evals/study-design/score.cjs replay evals/study-design/example-outputs.json`. Those two **synthetic** responses and ten deliberately missing rows exercise the scorer; they are not answers from a model.

A scientific comparison needs unseen questions curated separately (including informative answers and justified abstentions), real source materials, fixed source packets/model/settings/budget, independent scoring of anonymized final answers and measurements of both outcomes. Neither a development fixture score nor a one-pass replay establishes the 48-question pilot proposed in the report.

## First blinded replay — November 13, 2026

A fresh ChatGPT Work assistant in this session was instructed to read only the frozen prompt and 12 packets and return a single set of labels. It was not given the key, validator, repository context or prior conversation. It used no paid Pherogent model call. The worker's model snapshot and sampling parameters were not independently pinned; later assistant runs need not yield identical outputs. The exact saved proposal set is `blinded-outputs.json`; replaying the saved judgments is deterministic.

| Label outcome on this packet set | Written rules | Same judgments after enforcement |
| --- | ---: | ---: |
| Unsupported claims endorsed | 0/5 | 0/5 |
| Answerable claims correctly labeled | 7/7 | 7/7 |
| Missing or invalid responses | 0/12 | 0/12 |

No label changed, so this exercise found **no incremental benefit** of enforcement on these examples. The answerable and unsupported excerpts were written for development, not drawn independently from manuscripts. Only labels were scored; reasons were not adjudicated by independent researchers. This is not a performance claim about Pherogent's production judge. Developer rule regressions that deliberately force a bad model verdict show that a fail-safe works, not how often a real model will need it.

To reproduce: `node evals/study-design/score.cjs replay evals/study-design/blinded-outputs.json`.
The frozen packet SHA-256 is `afc24c6cc29cf637576f69bfc0e3ea38b3c7f47e400fa80ef57a157acbd4b755`; instruction SHA-256 is `2acd9c92fee3f4c18809d17f008e01e44ab80eec9adc7fd6a6090be70c4da015`; saved output SHA-256 is `f479c5fa637eba9839bb40b984ca6f9419cfd9994b7b98799059326057f38cc0`.
