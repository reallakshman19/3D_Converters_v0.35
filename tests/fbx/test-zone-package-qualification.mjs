import assert from 'node:assert/strict';
import { runZonePackageQualification } from '../../tabs/model-converters/converters/fbx/zone-package/qualification.js';

{
  const report = await runZonePackageQualification({ geometryCount: 200 });
  assert.equal(report.overallStatus, 'PASS');
  assert.equal(report.checks.byteDeterminism, true);
  assert.equal(report.checks.resourceCeiling, true);
  assert.equal(report.checks.ledgerCoverage, true);
  assert.equal(report.ledgerCoverage.explained, 200);
  assert.equal(report.ledgerCoverage.expected, 200);
  assert.match(report.archiveSha256, /^[0-9a-f]{64}$/);
  assert.match(report.reportDigest, /^[0-9a-f]{64}$/);

  const again = await runZonePackageQualification({ geometryCount: 200 });
  assert.equal(report.reportDigest, again.reportDigest, 'the qualification report itself must be reproducible');
}

{
  const small = await runZonePackageQualification({ geometryCount: 5 });
  assert.equal(small.overallStatus, 'PASS');
  assert.equal(small.ledgerCoverage.explained, 5);
}

console.log('test-zone-package-qualification: PASS');
