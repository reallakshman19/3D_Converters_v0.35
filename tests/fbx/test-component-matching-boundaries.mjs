import assert from 'node:assert/strict';
import { resolveComponentMatches } from '../../tabs/model-converters/converters/fbx/benchmark/component-matching.js';

const subject = (subjectId, reference, sourceName) => ({
  subjectId,
  family: 'FLANGE',
  reference,
  sourceName,
});

const policy = {
  identityRules: [
    {
      ruleId: 'reference-collision',
      kind: 'EXACT',
      passing: true,
      applicableFamilies: ['FLANGE'],
      requiredFields: ['reference'],
      normalizationRuleIds: [],
      scope: 'GLOBAL',
    },
    {
      ruleId: 'approved-name-resolution',
      kind: 'APPROVED_COMPOSITE',
      passing: true,
      applicableFamilies: ['FLANGE'],
      requiredFields: ['name'],
      normalizationRuleIds: [],
      scope: 'GLOBAL',
    },
  ],
};

const resolved = resolveComponentMatches(
  [subject('R1', 'SAME', 'A'), subject('R2', 'SAME', 'B')],
  [subject('A1', 'SAME', 'B'), subject('A2', 'SAME', 'A')],
  policy,
);
assert.equal(resolved.matches.size, 4);
assert.equal(resolved.collisionGroups.length, 1);
assert.equal(resolved.collisionGroups[0].resolution, 'RESOLVED_BY_APPROVED_RULE');

const escaped = resolveComponentMatches(
  [
    subject('R1', 'SAME', 'A'), subject('R2', 'SAME', 'B'),
    subject('R3', 'R3', 'C'), subject('R4', 'R4', 'D'),
  ],
  [
    subject('A1', 'SAME', 'C'), subject('A2', 'SAME', 'D'),
    subject('A3', 'A3', 'A'), subject('A4', 'A4', 'B'),
  ],
  policy,
);
assert.equal(escaped.matches.size, 0, 'later rules must not escape prior collision candidate sets');
assert.equal(escaped.collisionGroups.length, 1);
assert.equal(escaped.collisionGroups[0].resolution, 'UNRESOLVED');

console.log('test-component-matching-boundaries: PASS');
