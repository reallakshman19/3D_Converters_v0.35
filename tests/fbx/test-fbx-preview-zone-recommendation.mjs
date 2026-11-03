import assert from 'node:assert/strict';
import {
  extractFbxSelectedZoneRecommendation,
  matchFbxPreviewZoneRecommendation,
  resolveFbxPreviewAutoSelection,
} from '../../tabs/model-converters/fbx-preview-zone-recommendation.js';

const selectedZone = {
  zoneId: 'occ:flowline', label: '/FLOWLINE-01',
  policy: 'FbxSelectedZoneAutoPipePolicy.v1', rank: 1,
};
const project = {
  selectedZoneId: '',
  previewZones: [
    { zoneId: 'occ:mixed', label: '/MIXED-ZONE', sourcePointCount: 91373 },
    { zoneId: 'occ:flowline', label: '/FLOWLINE-01', sourcePointCount: 1534 },
  ],
};

{
  const detail = { outputs: [{
    name: 'model.selected-zone-classification-report.json',
    text: JSON.stringify({ selectedZone }),
  }] };
  assert.deepEqual(extractFbxSelectedZoneRecommendation(detail), selectedZone);
}
{
  const detail = { outputs: [{
    name: 'model.fbx-conversion-report.json',
    text: JSON.stringify({ diagnostics: [
      'SELECTED_ZONE_ID:occ:flowline',
      'SELECTED_ZONE_LABEL:/FLOWLINE-01',
      'SELECTED_ZONE_POLICY:FbxSelectedZoneAutoPipePolicy.v1',
      'SELECTED_ZONE_RANK:1',
    ] }),
  }] };
  assert.deepEqual(extractFbxSelectedZoneRecommendation(detail), selectedZone);
}
{
  assert.equal(extractFbxSelectedZoneRecommendation({ outputs: [] }), null);
  assert.equal(extractFbxSelectedZoneRecommendation({ outputs: [{
    name: 'bad.selected-zone-classification-report.json', text: '{',
  }] }), null);
}
{
  assert.deepEqual(matchFbxPreviewZoneRecommendation(project, selectedZone), selectedZone);
  assert.equal(matchFbxPreviewZoneRecommendation(project, { zoneId: 'occ:missing' }), null);
  assert.deepEqual(resolveFbxPreviewAutoSelection(project, selectedZone, false), selectedZone);
  assert.deepEqual(resolveFbxPreviewAutoSelection({ ...project, selectedZoneId: 'occ:mixed' },
    selectedZone, false), selectedZone,
  'governed recommendation must supersede a pre-existing preview default');
  assert.equal(resolveFbxPreviewAutoSelection(project, selectedZone, true), null,
    'automatic selection must be applied only once per source graph');
}

console.log('test-fbx-preview-zone-recommendation: PASS');
