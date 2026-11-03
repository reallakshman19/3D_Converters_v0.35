# FBX secondary-input and preview-authority correction

Release: `20260804-fbx-secondary-preview-1`

## Confirmed prior defects

1. The live addon changed legacy `primaryAccept` / `secondaryAccept` properties but did not synchronize the normalized `converter.inputs` records used by the file cards and execution handoff.
2. `legacy-adapter.js` snapshots FBX input metadata during module evaluation. The wrapper statically loaded the base renderer before installing the updated FBX input contract, so later mutations could not affect the rendered file cards.
3. Selected-zone StagedJSON preceded `.fbx-source-graph.json` in the output array. The generic preview selected the staged hierarchy first, hiding the source-graph-only zone selector and geometry/topology toolbar.

## Corrected invariants

- The primary and secondary normalized input records both accept ZIP files before the legacy renderer is loaded.
- The base Model Converters module is dynamically imported only after FBX input and runner installation.
- `.fbx-source-graph.json` is first in preview output order whenever present.
- Every run reports the exact primary and secondary file names and preview authority.
- A supplied secondary input combined with `OPTIONAL_MAPPING_ABSENT` fails closed as `BLOCKED_SECONDARY_INPUT_HANDOFF`.

## Expected governed-pair diagnostics

```text
FBX_LIVE_UI_ACTIVE:20260804-fbx-secondary-preview-1
FBX_PRIMARY_INPUT:STF_2026Jul23-1554_binary.zip
FBX_SECONDARY_INPUT:ATTRIBUTE_GL_managed_stage.zip
FBX_PREVIEW_AUTHORITY:SOURCE_GRAPH
MANAGED_STAGE_REFERENCE_PRESENT
MAPPING_NOT_REQUIRED_MANAGED_REFERENCE
SELECTED_ZONE_LABEL:/GLRD-1000-CU-PI-P
```
