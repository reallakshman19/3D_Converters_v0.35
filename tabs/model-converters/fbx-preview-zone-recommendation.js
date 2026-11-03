function parsedOutput(output) {
  if (!output || typeof output.text !== 'string') return null;
  try { return JSON.parse(output.text); } catch { return null; }
}

function normalizedRecommendation(selection) {
  const zoneId = String(selection?.zoneId || '');
  if (!zoneId) return null;
  return Object.freeze({
    zoneId,
    label: String(selection?.label || zoneId),
    policy: String(selection?.policy || ''),
    rank: Number(selection?.rank || 0),
  });
}

function diagnosticValue(diagnostics, prefix) {
  const item = diagnostics.find((value) => String(value).startsWith(prefix));
  return item ? String(item).slice(prefix.length) : '';
}

export function extractFbxSelectedZoneRecommendation(detail) {
  const outputs = Array.isArray(detail?.outputs) ? detail.outputs : [];
  const classification = outputs.find((item) =>
    /\.selected-zone-classification-report\.json$/i.test(String(item?.name || '')));
  const classified = normalizedRecommendation(parsedOutput(classification)?.selectedZone);
  if (classified) return classified;
  const conversion = outputs.find((item) =>
    /\.fbx-conversion-report\.json$/i.test(String(item?.name || '')));
  const diagnostics = parsedOutput(conversion)?.diagnostics;
  if (!Array.isArray(diagnostics)) return null;
  const zoneId = diagnosticValue(diagnostics, 'SELECTED_ZONE_ID:');
  if (!zoneId) return null;
  return normalizedRecommendation({
    zoneId,
    label: diagnosticValue(diagnostics, 'SELECTED_ZONE_LABEL:') || zoneId,
    policy: diagnosticValue(diagnostics, 'SELECTED_ZONE_POLICY:'),
    rank: Number(diagnosticValue(diagnostics, 'SELECTED_ZONE_RANK:') || 0),
  });
}

export function matchFbxPreviewZoneRecommendation(project, recommendation) {
  const zoneId = String(recommendation?.zoneId || '');
  const zones = Array.isArray(project?.previewZones) ? project.previewZones : [];
  const zone = zones.find((item) => item.zoneId === zoneId);
  return zone ? Object.freeze({ ...recommendation, label: zone.label }) : null;
}

export function resolveFbxPreviewAutoSelection(project, recommendation, alreadyApplied = false) {
  if (alreadyApplied) return null;
  return matchFbxPreviewZoneRecommendation(project, recommendation);
}
