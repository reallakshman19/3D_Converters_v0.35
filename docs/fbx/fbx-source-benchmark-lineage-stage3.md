# FBX Source-to-Benchmark Lineage — Stage 3

## Scope

Stage 3 records the repository producer rules that can explain synthetic and enriched benchmark records without asserting that those rules were actually invoked for this benchmark.

The governing evidence chain is:

```text
FbxBenchmarkSourceBinding.v1
FbxBenchmarkLineageAccounting.v1
FbxBenchmarkProducerAuthority.v1
FbxBenchmarkDerivationAuthority.v1
```

No FBX parser, converter, mapper, benchmark record, or Agent Q behavior is changed.

## Pinned producer code

The producer-authority manifest binds exact Git blobs at benchmark commit `ecd841cd41cc7a8df1764cec502e0873f578a5dc` for:

- `converters/rmss-attribute-parser.js`;
- `tabs/model-converters/converters/rvmattr-to-xml.js`;
- `support/SupportKindResolver.js`;
- `rvm-viewer/RvmSupportMapper.js`;
- `converters/xml-cii2019-core/support-mapping.js`.

The same blobs remain present at the Stage 3 baseline. The real CLI recomputes every Git blob identity from repository bytes before audit execution.

## Admitted claims

Each benchmark occurrence is covered exactly once and may receive one or more claims:

```text
DIRECT_IDENTITY
TYPE_NORMALIZATION
SYNTHETIC_PIPE
SUPPORT_SHAPING
SUPPORT_KIND_MAPPING
BRANCH_OWNER_SITE
UNRESOLVED_RECORD
```

Record conformance is separate from derivation authority:

- `BOUND_BY_STAGE2` means Stage 2 proved exact one-to-one identity.
- `PINNED_RULE_RUN_UNBOUND` means the record conforms to a pinned producer rule, but no exact producer invocation is bound.
- `PINNED_RULE_CONFIG_UNBOUND` means the code is pinned but runtime/user mapping configuration is absent.
- `UNRESOLVED` means no admitted rule accounts for the record.

A conforming record is not automatically treated as source-derived.

## Synthetic-pipe checks

A synthetic pipe must retain:

- `type=PIPE`;
- a `PIPE AUTO` name;
- `AUTO_GENERATED_PIPE=true`;
- finite `APOS` and `LPOS`;
- `GAP_MM` matching endpoint distance within rounding tolerance;
- an admitted `ROUTE_TIER`;
- non-empty `BORE_SOURCE`.

These checks prove rule conformance only. The routing method options and generation command remain unbound.

## Support checks

Stage 3 reproduces the pinned RMSS support-shaping rules for raw-type normalization, support tag selection, and support-type text normalization. It separately validates the shape and agreement of `SUPPORT_KIND` and `SUPPORT_MAPPER_KIND`.

Support-kind authority remains blocked because the mapper can consume browser `localStorage` user rules and built-in overrides. No user-rule/configuration snapshot is attached to the benchmark.

## Remaining provenance gaps

The following are intentionally retained as `UNBOUND`:

```text
RMSS/ATT input identity
generation command
routing options
support-mapper configuration
```

The supplied FBX identity does not substitute for the missing RMSS/ATT producer input. The benchmark commit contains only the benchmark artifact and no generation manifest.

## Real execution

From a complete repository checkout:

```text
node scripts/fbx/build-source-benchmark-derivation-authority.mjs /absolute/path/to/fbxtaya.fbx
```

Default output:

```text
.qualification/fbx-benchmark/FbxBenchmarkDerivationAuthority.v1.json
```

The expected status is `BLOCKED` until producer input and invocation evidence are supplied. `FAIL` indicates malformed or contradictory benchmark records, while `PASS` is not available merely because records conform to pinned rules.
