import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildModeASmartMapGroups,
  modeASmartMapPipingClassPrefix,
  modeASmartMapService,
  rankModeASmartMapCatalogForGroup,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-smart-map-v2.js';

assert.equal(modeASmartMapService('S8810450'), 'S');
assert.equal(modeASmartMapService('SW-8810450'), 'SW');
assert.equal(modeASmartMapPipingClassPrefix('12-Ab7_Cd-55'), 'ABC');
assert.equal(modeASmartMapPipingClassPrefix('9126129'), '');

const rows = [{
  sourceId: 'SRC1',
  fileName: 'SYS-TEST.xml',
  branchName: '/ASIM-1900-3"-S8810450-ABC12X-01/B1',
  lineKey: 'S8810450',
  pipingClass: '12-A_BC-900',
  lineMiss: true,
}];

const keys = {
  SRC1: ['W8810450', 'S8810451', 'S8810452', 'S8819999'],
};
const catalog = {
  SRC1: [
    { key: 'W8810450', service: 'W', pipingClass: 'ABC999' },
    { key: 'S8810451', service: 'S', pipingClass: 'XYZ999' },
    { key: 'S8810452', service: 'S', pipingClass: 'ABC777' },
    { key: 'S8819999', service: 'S', pipingClass: 'ABC111' },
  ],
};

const groups = buildModeASmartMapGroups(rows, keys, catalog);
assert.equal(groups.length, 1);
const group = groups[0];
assert.equal(group.service, 'S');
assert.equal(group.pipingClassPrefix, 'ABC');
assert.equal(group.status, 'similar');
assert.equal(group.recommended, 'S8810452', 'same Service + same 3-letter Piping Class prefix must outrank equally similar alternatives');
assert.match(group.reason, /Service S prioritized first/);
assert.match(group.reason, /Piping Class ABC second/);

const similarCandidates = group.candidates.filter((candidate) => candidate.basis === 'similar');
assert.equal(similarCandidates[0].key, 'S8810452');
assert.equal(similarCandidates[0].serviceMatch, true);
assert.equal(similarCandidates[0].classPrefixMatch, true);
const wrongService = similarCandidates.find((candidate) => candidate.key === 'W8810450');
assert(wrongService, 'wrong-service candidate may remain visible for review');
assert.equal(wrongService.serviceMatch, false);

const dropdownOrder = rankModeASmartMapCatalogForGroup(group, catalog.SRC1);
assert.equal(dropdownOrder[0].key, 'S8810452');
assert(dropdownOrder.findIndex((entry) => entry.key === 'W8810450') > dropdownOrder.findIndex((entry) => entry.key === 'S8810451'), 'same Service must sort ahead of wrong Service even when class differs');

const uiSource = fs.readFileSync(new URL('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-smart-map-ui-v2.js', import.meta.url), 'utf8');
assert.match(uiSource, /document\.createElement\('select'\)/, 'Map To must use a native select dropdown');
assert.match(uiSource, /Smart suggestions/);
assert.match(uiSource, /All project Line Keys/);
assert.doesNotMatch(uiSource, /setAttribute\('list'/, 'v2 Map To must not depend on datalist');

console.log('xml-cii Mode A Smart Map service/class priority tests: PASS');
