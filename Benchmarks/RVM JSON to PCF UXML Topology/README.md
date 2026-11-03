# RVM JSON to PCF UXML Topology Benchmark

This benchmark validates the alternate JSON/RVM → PCF topology route.

## Route Under Test

```text
Extracted RVM/JSON rows
  ↓
RowsToUXML adapter
  ↓
UXML validation
  ↓
Face model
  ↓
UniversalTopoGraph
  ↓
RayTopoGraph
  ↓
Comparator
  ↓
TopologyDecisionGate
  ↓
Legacy-compatible readinessGate
  ↓
Existing master resolution + existing PCF emitter
```

## Scope

This benchmark intentionally tests topology only.

It does not:

* emit PCF directly from UXML
* resolve masters
* mutate coordinates
* apply Ray fixes
* bypass existing legacy PCF export logic

## Dataset

`broken-topology-50-rows.json`

Includes:

* 50 rows
* PIPE / VALVE / FLANGE / REDUCER / TEE / OLET / ELBOW / BEND / SUPPORT
* X/Y/Z routing
* rolled/offset branches
* gaps of 3, 4, 6, 15 and 20 mm
* orphan TEE_BRANCH and OLET_BRANCH
* one Ray-resolvable branch within 500 mm
* one intentionally unresolved branch beyond 500 mm
* row identity fields: rowNo, refNo, seqNo, lineNo, pipelineRef

## Expected Outcome

`expected-uxml-topology-outcome.json`

The test validates:

* UXML route runs end-to-end
* topology mode is UXML_TOPOLOGY
* UXML component count equals row count
* UniversalTopoGraph / RayTopoGraph / Comparator / DecisionGate are all created
* Ray candidates are present
* accepted topology decisions are present
* unresolved/manual items are visible
* diagnostics preserve row identity
* legacy master and PCF emitter route remains preserved
* source rows are not mutated
