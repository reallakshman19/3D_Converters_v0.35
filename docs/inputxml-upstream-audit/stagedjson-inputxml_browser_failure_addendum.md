# StagedJSON → InputXML browser failure diagnostics addendum

Date: 2026-07-13

## Finding

The Python converter writes `<stem>_stagedjson_to_inputxml_diagnostics.json` before raising on a zero-element conversion. The browser worker currently awaits the Python script without a staged-specific failure handoff. When Python raises, `_runJob()` exits before reading the sidecar. The diagnostics panel therefore receives no structured evidence for the exact failure mode where it is most needed.

## Authority decision

- The conversion must remain failed; zero-element InputXML must not be presented as a valid output.
- The existing worker response contract will not be globally broadened.
- For `converterId === "stagedjson_to_inputxml"` only, the worker may recover the already-written diagnostics sidecar into an internal result marked `logs.failed=true`.
- The staged-specific UI wrapper will dispatch the diagnostics to the panel and then throw the recorded conversion error so the generic runner still marks the run failed.
- The panel will provide its own JSON download action. This keeps the sidecar downloadable even though the failed run is not added to the generic successful-output list.
- If the Python failure produced no diagnostics sidecar, the worker must preserve the original failure behavior.

## Compatibility boundary

This correction is conditional on `stagedjson_to_inputxml`; it does not change worker behavior for XML, InputXML→CII, REV, RVM/ATT or other converters. The Mission J protected-route hash may be updated only after its source-mode integration test and the named base-versus-head ledger remain green.
