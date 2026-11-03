import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  captureConfiguredJsonTraceFields,
  decorateJsonTraceLedger,
  decorateJsonTraceMember,
  formatConfiguredJsonTraceMember,
} from '../tabs/xml-cii-2019-standalone/xml-cii-json-trace-fields.js';
import { buildAdaptedJsonTraceTree } from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-regex-results.js';
import {
  classifySupportText,
  createDefaultSupportTypeMapperConfig,
  runStandaloneSupportTypeMapper,
} from '../tabs/xml-cii-2019-standalone/xml-cii-support-type-mapper.js';

test('configured trace fields capture MDSSUPPTYPE', () => {
  const raw = {
    attributes: {
      DTXR: 'REST',
      NAME: '/SL-1844103.2.1',
      MDSSUPPTYPE: 'XXXX',
      SPREF: 'A1',
    },
  };
  const captured = captureConfiguredJsonTraceFields(raw, {});
  assert.equal(captured.DTXR, 'REST');
  assert.equal(captured.NAME, '/SL-1844103.2.1');
  assert.equal(captured.MDSSUPPTYPE, 'XXXX');
  assert.equal(captured.SPREF, 'A1');
  assert.equal(
    formatConfiguredJsonTraceMember(decorateJsonTraceMember({ raw }, {}), {}),
    'REST(NAME=/SL-1844103.2.1),SPREF=A1,MDSSUPPTYPE=XXXX',
  );
});

test('disabled capture field is omitted', () => {
  const config = {
    captureFields: [
      { name: 'DTXR', enabled: true },
      { name: 'NAME', enabled: true },
      { name: 'MDSSUPPTYPE', enabled: false },
    ],
  };
  const member = decorateJsonTraceMember({
    raw: { attributes: { DTXR: 'REST', NAME: '/SL-X', MDSSUPPTYPE: 'GT500' } },
  }, config);
  assert.equal(formatConfiguredJsonTraceMember(member, config), 'REST(NAME=/SL-X)');
});

test('evidence tree renders all position members with configured fields', () => {
  const config = { captureFields: ['DTXR', 'SPRE', 'NAME', 'MDSSUPPTYPE'] };
  const members = [
    { raw: { attributes: { DTXR: 'REST', NAME: '/SL-1844103.2.1', MDSSUPPTYPE: 'XXXX' } } },
    { raw: { type: '/MDS-Ancillaries/ANCI/AT503-80mm', attributes: { NAME: '/SL-1844103.1.1', MDSSUPPTYPE: 'AT503' } } },
    { raw: { type: '/MDS-Ancillaries/ANCI/GT500-80mm', attributes: { NAME: '/SL-1844103.1.2', MDSSUPPTYPE: 'GT500' } } },
    { raw: { type: '/MDS-Ancillaries/ANCI/ST501-80mm', attributes: { NAME: '/SL-1844103.1.3', MDSSUPPTYPE: 'ST501' } } },
  ].map((member) => decorateJsonTraceMember(member, config));
  const tree = buildAdaptedJsonTraceTree([{
    hitCount: 4,
    branchName: '/ASIM-1844/B1',
    stagedBore: '80mm',
    posKey: 'E=857413.4 N=3404711.58 EL=1100',
    positionMembers: members,
    jsonTraceConfig: config,
  }]);
  const position = tree[0].bores[0].positions[0];
  assert.equal(position.count, 4);
  assert.match(position.concatenated, /REST\(NAME=\/SL-1844103\.2\.1\),MDSSUPPTYPE=XXXX/);
  assert.match(position.concatenated, /GT500-80mm\(NAME=\/SL-1844103\.1\.2\),MDSSUPPTYPE=GT500/);
  assert.match(position.concatenated, /ST501-80mm\(NAME=\/SL-1844103\.1\.3\),MDSSUPPTYPE=ST501/);
  assert.equal(position.concatenated.split(' | ').length, 4);
});

test('support mapper classifies GT/ST without reading REST as ST', () => {
  const rows = createDefaultSupportTypeMapperConfig();
  assert.equal(classifySupportText('MDSSUPPTYPE="GT500"', rows).supportKind, 'GUIDE');
  assert.equal(classifySupportText('MDSSUPPTYPE="ST501"', rows).supportKind, 'LINESTOP');
  assert.equal(classifySupportText('REST(NAME=/SL-X)', rows).supportKind, 'REST');
});

test('saved mapper config writes MDS prefix rules used by enrichment', () => {
  const result = runStandaloneSupportTypeMapper({
    supportConfigJson: '{}',
    testInput: 'MDSSUPPTYPE=GT500',
  });
  const config = JSON.parse(result.supportConfigJson);
  const rules = config.supportMapping.rules;
  assert.ok(rules.some((rule) => rule.id === 'standalone-mds-gt-guide'
    && rule.field === 'MDSSUPPTYPE' && rule.kind === 'GUIDE'));
  assert.ok(rules.some((rule) => rule.id === 'standalone-mds-st-linestop'
    && rule.field === 'MDSSUPPTYPE' && rule.kind === 'LINESTOP'));
});

test('trace ledger derives GUIDE and LINESTOP from captured MDS codes', () => {
  const result = decorateJsonTraceLedger({
    groups: [{ entries: [
      { path: '$.gt', raw: { attributes: { MDSSUPPTYPE: 'GT500' } } },
      { path: '$.st', raw: { attributes: { MDSSUPPTYPE: 'ST501' } } },
    ] }],
    records: [{
      positionMembers: [{ sourcePath: '$.gt' }, { sourcePath: '$.st' }],
      derivedSupportTypes: ['REST'],
    }],
    ledger: [],
  }, {});
  assert.deepEqual(result.records[0].derivedSupportTypes, ['REST', 'GUIDE', 'LINESTOP']);
  assert.equal(result.records[0].positionMembers[0].capturedFields.MDSSUPPTYPE, 'GT500');
});

test('UI enhancement exposes table config, diagnostics explanation, and composed activation', async () => {
  const source = await readFile(new URL(
    '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-json-trace-field-ui.js',
    import.meta.url,
  ), 'utf8');
  const wrapper = await readFile(new URL(
    '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-workflow-shell-rigid-review-v2.js',
    import.meta.url,
  ), 'utf8');
  const tab = await readFile(new URL('../tabs/xml-cii-2019-standalone-tab.js', import.meta.url), 'utf8');
  assert.match(source, /Captured staged JSON fields/);
  assert.match(source, /Resolver Diagnostics \(internal counts and decisions\)/);
  assert.match(source, /It does not modify the enriched XML/);
  assert.match(source, /support-mapper-aliases-GUIDE/);
  assert.match(source, /support-mapper-aliases-LINESTOP/);
  assert.match(wrapper, /installRigidReviewActionsEnhancement/);
  assert.match(wrapper, /installJsonTraceFieldUiEnhancement/);
  assert.match(wrapper, /workflow-shell-strict-line\.js\?v=20260804-json-trace-fields-v3/);
  assert.match(tab, /workflow-shell-rigid-review-v2\.js\?v=20260804-json-trace-fields-v3/);
});
