import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildAivCanvasProjection } from '../converters/vibration/aiv/aiv-canvas-projection.js';
import {
  renderAivCanvasAssessmentResultHtml,
  renderAivCanvasRelationshipResultHtml,
  renderAivCanvasSourceResultHtml,
} from '../tabs/vibration-aiv-canvas-results.js';
import { renderAivCanvasWorkspaceHtml } from '../tabs/vibration-aiv-canvas-view.js';

function tables() {
  return {
    sources: {
      kind: 'sources',
      header: ['Source Canonical ID', 'Operating Case', 'Source Device Type'],
      rows: [['SRC-1', 'CASE-A', 'RELIEF_VALVE']],
    },
    assessments: {
      kind: 'assessments', header: ['Assessment Canonical ID', 'Assessment Type'], rows: [['ASSMT-1', 'WELDOLET']],
    },
    relationships: {
      kind: 'relationships',
      header: ['Source Canonical ID', 'Assessment Canonical ID', 'Operating Case', 'Physical Distance', 'Physical Distance Unit', 'Distance Source', 'Distance Source Revision', 'Simultaneous Source Group', 'Applicability Disposition'],
      rows: [['SRC-1', 'ASSMT-1', 'CASE-A', '0.8', 'm', 'DIST-DOC', 'R1', 'GROUP-1', 'APPLICABLE']],
    },
  };
}

function result() {
  const authority = {
    calculationState: 'IMPLEMENTED', qualificationState: 'SCREENING', engineeringAuthority: 'SCREENING',
    screeningAuthority: 'AUTHORIZED', designAuthority: false,
  };
  return {
    outputs: {
      sourceResults: [{
        resultScope: 'SOURCE', status: 'SCREENING_CALCULATED', sourceCanonicalId: 'SRC-1', caseId: 'CASE-A',
        rawSourcePwlDb: 164.6851759525391, sonicFlowFactorDb: 0, trimReductionDb: 0,
        effectiveSourcePwlDb: 164.6851759525391, authority, trace: { traceIds: ['AIV-EQ-SOURCE-PWL-001'] },
      }],
      assessmentResults: [{
        resultScope: 'ASSESSMENT', status: 'SCREENING_CALCULATED', assessmentCanonicalId: 'ASSMT-1', caseId: 'CASE-A', line: 'LINE-1',
        contributingSourceCanonicalIds: ['SRC-1'], combinedPointPwlDb: 164.3734876408508,
        sourceContributionsAtPoint: [{
          sourceCanonicalId: 'SRC-1', assessmentCanonicalId: 'ASSMT-1', caseId: 'CASE-A', simultaneousSourceGroup: 'GROUP-1',
          effectiveSourcePwlDb: 164.6851759525391, physicalDistanceM: 0.8,
          attenuationDb: 0.3116883116883117, pointPwlDb: 164.3734876408508,
          trace: { traceIds: ['AIV-EQ-ATTENUATION-001'] },
        }],
        t26Intermediates: { FLM1: 1.2133, FLM2: 0.2009306328510857, Lf: 0.31287602368755874 },
        lof: 0.29, authority,
      }],
      lineCaseSummaries: [{
        resultScope: 'LINE_CASE_SUMMARY', line: 'LINE-1', caseId: 'CASE-A', lof: 1.48,
        authoritativeForScreening: false, authority,
      }],
    },
  };
}

test('projection passes Source, relationship contribution and Assessment screening values through exactly', () => {
  const projection = buildAivCanvasProjection({ tables: tables(), screeningResult: result() });
  const source = projection.nodes.find((item) => item.nodeKey === 'SOURCE:SRC-1:CASE-A');
  const assessment = projection.nodes.find((item) => item.nodeKey === 'ASSESSMENT:ASSMT-1');
  const relationship = projection.relationships[0];
  assert.deepEqual(
    [source.resultSummary.rawSourcePwlDb, source.resultSummary.sonicFlowFactorDb, source.resultSummary.trimReductionDb, source.resultSummary.effectiveSourcePwlDb],
    [164.6851759525391, 0, 0, 164.6851759525391],
  );
  assert.equal(relationship.physicalDistance, '0.8');
  assert.equal(relationship.screeningContribution.attenuationDb, 0.3116883116883117);
  assert.equal(relationship.screeningContribution.pointPwlDb, 164.3734876408508);
  assert.equal(assessment.resultSummary.combinedPointPwlDb, 164.3734876408508);
  assert.deepEqual(assessment.resultSummary.contributingSourceCanonicalIds, ['SRC-1']);
  assert.equal(assessment.resultSummary.lof, 0.29);
  assert.equal(assessment.resultSummary.authority.screeningAuthority, 'AUTHORIZED');
  assert.equal(assessment.resultSummary.authority.designAuthority, false);
});

test('selected result renderers expose returned values and explicit result scopes', () => {
  const projection = buildAivCanvasProjection({ tables: tables(), screeningResult: result() });
  const source = projection.nodes.find((item) => item.nodeKind === 'SOURCE');
  const assessment = projection.nodes.find((item) => item.nodeKind === 'ASSESSMENT');
  const relationship = projection.relationships[0];
  const sourceHtml = renderAivCanvasSourceResultHtml(source);
  const relationshipHtml = renderAivCanvasRelationshipResultHtml(relationship);
  const assessmentHtml = renderAivCanvasAssessmentResultHtml(assessment);
  assert.match(sourceHtml, /Raw source PWL/u);
  assert.match(sourceHtml, /164\.6851759525391/u);
  assert.match(sourceHtml, /SFF/u);
  assert.match(relationshipHtml, /Explicit physical distance/u);
  assert.match(relationshipHtml, /0\.3116883116883117/u);
  assert.match(relationshipHtml, /164\.3734876408508/u);
  assert.match(assessmentHtml, /Assessment screening result/u);
  assert.match(assessmentHtml, /Assessment LOF/u);
  assert.match(assessmentHtml, />0\.29</u);
  assert.match(assessmentHtml, /AUTHORIZED/u);
  assert.match(assessmentHtml, /false/u);
});

test('relationship without a kernel contribution never invents attenuation or point PWL', () => {
  const projection = buildAivCanvasProjection({ tables: tables() });
  const html = renderAivCanvasRelationshipResultHtml(projection.relationships[0]);
  assert.match(html, /No kernel contribution exists/u);
  assert.match(html, /No attenuation or point PWL is inferred/u);
  assert.doesNotMatch(html, /0\.311688/u);
});

test('Assessment LOF 0.29 remains visually separate from Line\/Case 1.48 non-authoritative trace', () => {
  const html = renderAivCanvasWorkspaceHtml({ tables: tables(), screeningResult: result() });
  assert.match(html, /Assessment LOF/u);
  assert.match(html, />0\.29</u);
  assert.match(html, /NON-AUTHORITATIVE FOR SCREENING/u);
  assert.match(html, /LINE-1 \/ CASE-A: 1\.48/u);
  assert.doesNotMatch(html, /Assessment LOF[^<]*1\.48/iu);
});

test('canvas result modules contain no AIV equation implementation or numerical-kernel import', () => {
  const resultsSource = readFileSync(new URL('../tabs/vibration-aiv-canvas-results.js', import.meta.url), 'utf8');
  const viewSource = readFileSync(new URL('../tabs/vibration-aiv-canvas-view.js', import.meta.url), 'utf8');
  for (const source of [resultsSource, viewSource]) {
    assert.doesNotMatch(source, /calculateAiv|aiv-kernel-candidate|Math\.(?:log10|log|tanh|pow)|\*\*/u);
    assert.doesNotMatch(source, /combinedPointPwlDb\s*=|attenuationDb\s*=|\blof\s*=/iu);
  }
  assert.match(resultsSource, /screeningContribution/u);
  assert.match(resultsSource, /NON-AUTHORITATIVE|Assessment screening result|No kernel contribution/u);
});
