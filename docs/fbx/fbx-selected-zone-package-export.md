# FBX selected-zone browser package export (Phase 6)

`tabs/model-converters/fbx-zone-package-export.js` +
`tabs/model-converters/converters/fbx/zone-package/archive.js`.

## What this does

- `archive.js` (`buildPackageArchive` / `readPackageArchive`) is a pure,
  dependency-free, deterministic archive codec: an 8-byte magic, a 4-byte
  header length, a JSON directory (`path`/`offset`/`length`/`sha256` per
  file), then the concatenated file bytes in the package builder's
  deterministic order. It is not ZIP-compatible; it exists purely so a
  Phase 1 package's file list can be downloaded as one bounded artifact.
- `installFbxZonePackageExport(container, getPackageInputs)` mounts a
  "Download zone package" button. On click it builds the full package in
  memory (Phase 1), encodes it into one archive, and triggers a download
  using the same object-URL pattern already used elsewhere in this tab
  (`fbx-preview-zone-selector.js`): create the `Blob`/object URL, click a
  detached `<a download>`, remove it, then `revokeObjectURL` — the archive
  is fully built and validated before anything is exposed to the user
  (atomic publication), and the object URL is explicitly revoked
  immediately after use (no leaked URLs).

## Non-scope

No parser, `staged-writer.js`, Worker, or canvas code is imported or
touched by this file (asserted directly by
`tests/fbx/test-zone-package-export-static.mjs`).

## Known gap — integration seam, not wired to live data

`installFbxZonePackageExport` takes a `getPackageInputs` callback that must
resolve to `{ manifest, buffersByGeometryId, stagedJsonText?,
supportEvidence?, fileNamePrefix? }` for whatever zone is currently
selected. It is registered in `ModelConvertersTab.js`'s idle-scheduled
installer queue with `null`, so the button mounts and is inert until a
caller supplies that callback. Nothing in the currently-merged app state
produces `FbxSelectedZoneGeometryManifest.v1` from a live parsed FBX yet —
that data flow (parser → occurrence/geometry extraction → Phase 1 inputs)
is outside this Phase's scope and is not claimed as done here.
