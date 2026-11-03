function cleanFilePart(value, fallback) {
  const cleaned = String(value ?? '').trim().replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

function prefix(sourceName, zoneLabel) {
  return `${cleanFilePart(sourceName, 'fbx-source')}.${cleanFilePart(zoneLabel, 'selected-zone')}`;
}

export function buildFbxZoneGeometryDownloadName(sourceName, zoneLabel) {
  return `${prefix(sourceName, zoneLabel)}.FbxZoneGeometryEvidence.v1.json`;
}

export function buildFbxDerivedPortDownloadName(sourceName, zoneLabel) {
  return `${prefix(sourceName, zoneLabel)}.FbxDerivedPortEvidence.v1.json`;
}

export function buildFbxInternalPipeDownloadName(sourceName, zoneLabel) {
  return `${prefix(sourceName, zoneLabel)}.FbxInternalPipeMapping.v1.json`;
}

export function buildFbxConnectivityDownloadName(sourceName, zoneLabel) {
  return `${prefix(sourceName, zoneLabel)}.FbxSelectedZoneConnectivityEvidence.v1.json`;
}

export function buildFbxGeneratedGapPipeDownloadName(sourceName, zoneLabel) {
  return `${prefix(sourceName, zoneLabel)}.FbxSelectedZoneGeneratedGapPipeEvidence.v1.json`;
}

export function buildFbxElbowDownloadName(sourceName, zoneLabel) {
  return `${prefix(sourceName, zoneLabel)}.FbxElbowPortEvidence.v1.json`;
}

export function buildFbxTeeDownloadName(sourceName, zoneLabel) {
  return `${prefix(sourceName, zoneLabel)}.FbxTeePortEvidence.v1.json`;
}

export function buildFbxReducerDownloadName(sourceName, zoneLabel) {
  return `${prefix(sourceName, zoneLabel)}.FbxReducerPortEvidence.v1.json`;
}

export function buildFbxBranchFittingDownloadName(sourceName, zoneLabel) {
  return `${prefix(sourceName, zoneLabel)}.FbxBranchFittingPortEvidence.v1.json`;
}

export function buildFbxInlineAssemblyDownloadName(sourceName, zoneLabel) {
  return `${prefix(sourceName, zoneLabel)}.FbxInlineAssemblyPortEvidence.v1.json`;
}

export function buildFbxSelectedZoneReleaseOutputName(sourceName, zoneLabel) {
  return `${prefix(sourceName, zoneLabel)}.selected-zone.staged.json`;
}

export function buildFbxAutoPipeOutputName(sourceName, zoneLabel) {
  return `${prefix(sourceName, zoneLabel)}.pipe-only-inference.staged.json`;
}

export function triggerJsonDownload(text, fileName, documentRef = document) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
  const anchor = documentRef.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  documentRef.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
