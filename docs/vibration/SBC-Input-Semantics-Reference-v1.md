# SBC Input Semantics Reference v1

## Authority boundary

This #563 artifact records reference semantics only. It does not qualify the EI method or authorize numerical execution.

```text
lifecycle                         = RESERVED
status                            = REFERENCE_SEMANTICS_POPULATED_PDF_REVIEW_PENDING
engineeringAuthority              = NONE
automaticClassificationAllowed    = false
numericalMethodUseAllowed          = false
engineeringDefaultsAllowed         = false
```

## Source custody

The controlled EI PDF identity remains `Common@fb549185...` / blob `9d3eccc...`. Direct PDF content review is not executable through the current connector, so PDF reconciliation remains pending.

The structured references were re-grounded at the user-specified `Advanced_Analysis@16d1e58f728e72b04b761c02dce682aa189779f2`. The relevant Appendix-D and P0 files have the same blobs as the earlier `76eb4bd...` pin, proving content continuity but not independent corroboration.

## Corrected structured-repository finding

Appendix D explicitly transcribes Type 1–4 worked examples and their applied flowcharts:

```text
TYPE_1 -> D5 -> T3-2
TYPE_2 -> D6 -> T3-4
TYPE_3 -> D7 -> T3-5
TYPE_4 -> D8 -> T3-8
```

P0 also transcribes Type-3 synthesis referencing T3-5, T3-6, T3-7 and T3-9. These records support explicit confirmation and input semantics. They do not by themselves establish a complete automatic four-way Type-selection algorithm.

## Semantic rules retained

- Minimum SBC diameter is expressed as nominal bore/diameter in inches in the worked examples.
- D5's overall branch length is the true parent-wall-to-valve-end length and includes lagging depth where present.
- D6 retains the two same-main-line branch legs independently.
- D7 separates first-span evidence from subsequent-span evidence and retains the first resting support boundary.
- D8 retains both end legs and the overall bridge span; the worked example demonstrates summing its two legs, but this artifact does not generalize that observation into an unreviewed calculation rule.
- Fitting, valve, schedule, location, support and mass context are explicit engineering evidence. Missing information is not silently defaulted.

## Prohibited promotions

This artifact does not authorize fitting factors, schedule substitutions, geometry/location scores, T3 curve reads, table values, equations, LOF arithmetic, benchmark expected values, or production/master publication. Type-3 numerical curves remain quarantined by #514 and D7 remains an oracle only.
