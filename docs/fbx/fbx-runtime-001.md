# FBX-RUNTIME-001 managed worker runtime

## Scope and baseline

This runtime governs the browser FBX parser-worker boundary without changing the committed ufbx/WASM parser, `FbxSourceGraph.v2`, mapping authority, engineering projection, geometry representation, or StagedJSON writers.

Implementation began after Stage A acceptance from branch/base SHA:

```text
branch: feat/fbx-runtime-001-managed-worker-runtime
base:   c547e8246d9aee2e322ed181a447ecb7352e0b56
```

The runtime uses one worker for one `PARSE_SOURCE_GRAPH` job. Every terminal outcome terminates that worker.

## Job and message contracts

A client transfers a defensive copy of the selected byte range:

```js
{
  schema: 'FbxWorkerJob.v1',
  operation: 'PARSE_SOURCE_GRAPH',
  jobId,
  inputByteLength,
  bytes: ArrayBuffer,
}
```

The worker emits only `FbxWorkerMessage.v1` envelopes:

```text
FBX_WORKER_ACCEPTED
FBX_WORKER_PROGRESS
FBX_WORKER_COMPLETE
FBX_WORKER_ERROR
```

Only a structurally valid `FBX_WORKER_COMPLETE` for the active job may resolve the parser promise. The completion graph is validated as a closed `FbxSourceGraph.v2` value, including nested record shapes, element-type pairings, transforms, geometry arrays, duplicate identities and cross-references. The resolved value is the graph alone. Diagnostics remain a sibling message field and are available only through an optional runtime callback.

## Memory ownership

1. The browser caller retains its original bytes.
2. The client copies exactly the selected `Uint8Array` view and transfers that copy.
3. The worker owns the transferred `ArrayBuffer` and creates a non-copying `Uint8Array` view.
4. The WASM bridge allocates input memory, copies the bytes, and frees the allocation in `finally`.
5. The C bridge owns the source/normalized ufbx scenes and frees them before returning.
6. The C bridge owns its result/error buffers. They remain valid while JavaScript decodes them and are reclaimed with the one-job worker/WASM instance.
7. `TextDecoder` and `JSON.parse()` create JavaScript-owned values. No WASM pointer or memory view escapes.
8. The worker structured-clones the policy-enforced graph to the client, then the client terminates the worker.

## Single-settlement lifecycle

The client state is first-terminal-wins:

```text
PENDING -> SETTLED_SUCCESS
PENDING -> SETTLED_ERROR
PENDING -> SETTLED_ABORT
PENDING -> SETTLED_TIMEOUT
```

Every transition performs the same cleanup before resolving or rejecting:

- clear timeout;
- remove abort listener;
- clear `onmessage`, `onerror`, and `onmessageerror`;
- terminate the worker exactly once;
- prevent further progress or diagnostics callbacks.

A saved or queued callback invoked after settlement checks the terminal state and has no effect.

Abort and timeout are hard cancellation. `fbx_parse()` is synchronous and opaque, so the runtime does not claim cooperative cancellation inside ufbx.

## Truthful progress

The protocol reports ordered stages, never percentages:

```text
preflight
loading-wasm
copying-input
parsing-fbx
decoding-result
enforcing-source-policy
preparing-transfer
complete
```

`parsing-fbx` is emitted immediately before the synchronous `fbx_parse()` call and remains the visible stage for its full duration. No byte-level progress or remaining-time estimate is inferred.

Success requires the complete ordered prefix. Preflight, WASM loading, ufbx parsing, result decoding, and source-policy errors may terminate only from their corresponding stage. Abort and timeout retain only the exact progress prefix observed by the client.

Both worker and client validate stage order. Duplicate, skipped, regressed, unknown, premature-complete, or post-terminal stages are protocol failures.

## Bounded preflight

Preflight reads only:

- declared and actual byte length;
- the first 23 bytes for exact binary magic;
- bytes 23 through 26 for the little-endian version;
- at most 512 bytes for rejection-only ASCII signature classification.

It does not inspect node records, offsets, arrays, properties, connections, geometry, or footer structure.

Fatal outcomes are:

```text
FBX_PREFLIGHT_EMPTY_INPUT
FBX_PREFLIGHT_SIZE_MISMATCH
FBX_PREFLIGHT_UNSUPPORTED_HEADER
FBX_PREFLIGHT_UNSUPPORTED_VERSION
```

A valid binary header and version `3000..7700` only authorize invocation of ufbx. ufbx and `enforceSourceGraphPolicy()` remain authoritative for document validity and accepted source semantics.

## Failure taxonomy

```text
FBX_WORKER_JOB_INVALID
FBX_PREFLIGHT_EMPTY_INPUT
FBX_PREFLIGHT_SIZE_MISMATCH
FBX_PREFLIGHT_UNSUPPORTED_HEADER
FBX_PREFLIGHT_UNSUPPORTED_VERSION
FBX_WORKER_ABORTED
FBX_WORKER_TIMEOUT
FBX_WORKER_RUNTIME_ERROR
FBX_WASM_LOAD_FAILED
FBX_PARSE_REJECTED
FBX_RESULT_DECODE_FAILED
FBX_SOURCE_GRAPH_POLICY_FAILED
```

Parser descriptions and JavaScript exception messages are retained only as bounded, non-authoritative detail. They do not create new public classifications or authorize partial publication.

Malformed messages, wrong job IDs, duplicate acceptance/completion, impossible progress, deserialization failure, malformed nested completion graphs, and completion after timeout all fail closed. No conversion artifact is published from those paths.

## Canonical-byte isolation

The following runtime-only values may exist in worker envelopes, client-local state, transient status callbacks, tests, and this document:

```text
workerMode
inputByteLength
progressStages
stageTimingsMs
workerCreated
terminalCode
sourceObjectCount
occurrenceCount
geometryCount
warningCount
unsupportedRecordCount
```

They must not enter:

- `FbxSourceGraph.v2`;
- mapping worklists or draft decisions;
- mapping ledgers, packages, or binding reports;
- deterministic conversion reports;
- StagedJSON;
- promoted no-mapping JSON;
- canonical hashes.

`parseFbxInWorker()` resolves the graph only. `fbx-to-stagedjson.js` uses stage callbacks solely for transient `setStatus()` updates.

## Validation

Required focused and regression commands:

```bash
node tests/fbx/test-worker-protocol.mjs
node tests/fbx/test-worker-preflight.mjs
node tests/fbx/test-worker-progress.mjs
node tests/fbx/test-worker-cancellation.mjs
node tests/fbx/test-worker-timeout.mjs
node tests/fbx/test-worker-byte-parity.mjs
node tests/fbx/test-worker-lifecycle.mjs
node tests/fbx/run-all.mjs
node tests/fbx/test-static-guards.mjs
```

The parity test compares canonical source-graph bytes and complete conversion results between the direct WASM/policy path and the managed worker path for:

- two-pipe mapping, package and no-mapping execution;
- axis/geometric-transform no-mapping execution;
- all-category no-mapping execution;
- component-family mapping, package, decision-set and no-mapping execution.

No hosted workflow run was available for the final head at merge time. That absence is recorded as an owner-directed residual-risk waiver and must not be represented as a passing CI result.
