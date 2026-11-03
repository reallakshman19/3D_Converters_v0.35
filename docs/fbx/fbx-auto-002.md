# FBX-AUTO-002 — deterministic PIPE inference and selected-zone StagedJSON

## Authority boundary

```text
exact FBX bytes
→ accepted parser/provenance
→ FbxSourceGraph.v2
→ FbxGeometryBundle.v1
→ FbxZoneGeometryEvidence.v1
→ FbxDerivedPortEvidence.v1
→ strict selected-zone PIPE admission
→ FbxInternalPipeMapping.v1
→ accepted PIPE family validation
→ accepted symmetric connectivity validation
→ accepted native StagedJSON writer
```

`FbxInternalPipeMapping.v1` is internal derived authority. It is not a public
`FbxStagedMapping.v1` or `FbxStagedMapping.v2` document and cannot be supplied
as an external mapping input. Public mapping validation and public port
resolution remain unchanged. No second StagedJSON writer exists.

## PIPE admission profile

`FbxAutoPipeProfile.v1` requires:

```text
minimum centre span:             0.000001 mm
normal dot tolerance:            0.00000001
A/L endpoint ordering:           world-centre lexicographic
end-radius agreement:            max(0.05 mm, radius × 0.001)
axial containment tolerance:     max(0.01 mm, span × 0.0001)
radial residual tolerance:       max(0.05 mm, radius × 0.001)
comparison:                      inclusive
```

Every mesh-bearing occurrence must own exactly one selected geometry. That
geometry must produce exactly two admitted boundary-loop candidates, zero
rejected or additional candidates, and one shell identity. Both candidate
orientations are evaluated, but only the lexicographically ordered world-centre
orientation may assign A to the lower endpoint and L to the higher endpoint.
That orientation must align both outward normals with the A→L centre span.
At least six exact control points are transformed by the accepted occurrence
matrix and must lie within the endpoint interval and on one constant-radius
open cylinder.

Names, materials, colours, display labels, hierarchy labels, preview samples
and renderer data are prohibited classification inputs. Capped, stepped,
branched, protruding, multi-shell, multi-geometry, non-cylindrical or
radius-varying geometry blocks the complete selected-zone release.

Zero-geometry selected occurrences are retained as `CONTEXT_ONLY` evidence.
They are not silently promoted and are not misclassified as failed components.
Shared source-model or geometry evidence across two PIPE entries blocks release.

## Connectivity profile

`FbxAutoPipeConnectivityProfile.v1` requires:

```text
centre coincidence:              0.000001 mm inclusive
normal dot tolerance:            0.00000001
radius agreement:                max(0.05 mm, radius × 0.001)
```

Zero matches remain open endpoints. Exactly one reciprocal match creates one
symmetric link. Multiple matches, self-links, asymmetric claims, dangling
claims, cycles, nonlinear degree, reused ports or non-coincident writer
endpoints block release. Coordinates are never snapped, averaged or moved.
Disconnected linear PIPE components become separate branches.

The closed resource profile limits one analysis to 1,024 PIPE occurrences,
2,048 ports and 2,096,128 candidate pairs.

## Deterministic identity

The internal artifact, classification profile, connectivity profile, entries,
logical components, ports and links use domain-separated SHA-256 identities.
Identity binds the exact source and parser evidence, both merged evidence
artifact IDs, selected zone ID, occurrence and geometry identities, derived
port evidence, profiles, reciprocal links and conservation counts. UI labels,
source insertion order, polygon order, candidate order, locale, time and random
values do not affect canonical bytes. Occurrence dispositions are emitted in
canonical occurrence-ID order.

## Writer and UI integration

The internal executor constructs the resolved PIPE entry/port structures used
by the accepted family, connectivity and writer modules. The writer retains its
public defaults byte-for-byte:

```text
mappingSchema:         FbxStagedMapping.v2
connectivityAuthority: explicit-mapping-port-links
```

Only the internal executor supplies:

```text
mappingSchema:         FbxInternalPipeMapping.v1
connectivityAuthority: derived-boundary-port-match
```

After zone analysis, geometry and derived-port evidence remain downloadable
whether PIPE inference passes or blocks. The PIPE inference artifact and zone
StagedJSON are published only after complete `STAGEDJSON_PASS`. New FBX input,
new converter run, zone change, new analysis, cancellation, failure or stale
result invalidates prior internal mapping and StagedJSON. A valid external
mapping result remains authoritative fallback when no matching active-zone
internal result exists.

## Validation status

At exact head `2b5fa1003efe475c3c0950a0c99da406db4051bc`, all seven focused tests pass
in the reconstruction environment: classification, classification failures,
connectivity, repeated-byte determinism, accepted-writer/public-default
regression, UI behavior and UI static authority. JavaScript syntax and the
production-file limit below 300 lines also pass.

A Chromium 144 DevTools run of the exact 14-module PIPE pipeline passes
successful release, repeated internal/StagedJSON bytes, topology counts,
context accounting and fail-closed blocked output. The managed browser is
restricted to an insecure `about:blank` context, so the harness supplies only
a SHA-256 `subtle.digest` polyfill; production modules are unchanged.

Hosted Actions remain `WAIVED_RESOURCE_LIMIT`, not PASS. A complete repository
checkout, complete FBX suite and committed-WASM direct/Worker parity remain
unexecuted because GitHub DNS is unavailable and the connector cannot
materialize the binary WASM blob. These unavailable proofs are not represented
as passing.
