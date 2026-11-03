# stagedJson CII(2019) enrichment

The production attribute-enrichment path is a parallel workflow inside **XML→CII 2019 Standalone**:

```text
managed stagedJson
  -> element-aware stagedJson adapter
  -> existing Standalone line/spec/material/weight resolvers
  -> enriched stagedJson + audit JSON + unresolved CSV
```

The original node-based XML workflow is rendered in its own host and is not modified by the stagedJson adapter. The adapter converts hierarchy nodes and elements into resolver contexts; it does not convert stagedJson into XML as an intermediate production artifact.

## Output contract

Eligible nodes receive `enrichedAttributes` with schema `stagedjson-cii2019-enriched-attributes/v1`. The record contains identity, line-list facts, piping specification, material, OPE/HYD density, insulation facts, pipe/component weights, sources, trace, status, missing fields, conflicts, and diagnostics.

Diagnostics use explicit severity/category/field/message/source information and always set `fallbackUsed: false` when required evidence is missing. Legacy resolver results whose source is `default-zero` or `config-default` are sanitized to `null` by the stagedJson adapter.

The writer adds only `enrichedAttributes` and `diagnostics`. It compares APOS, LPOS, POS, and CENTER before export and blocks export if those geometry fields change.

## Resolver configuration

The panel exposes its complete JSON configuration, including line-key attribute names, containment matching, and weight confidence/ambiguity thresholds. Master inputs are explicit browser imports; no mock master rows are injected.

## Audit artifacts

- Enriched stagedJson: original hierarchy/attributes plus enrichment and diagnostics.
- Audit JSON: counts, unresolved lists, per-node sources, and resolver trace.
- Unresolved CSV: review queue for missing/conflicting nodes.
