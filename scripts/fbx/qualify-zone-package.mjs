import { canonicalJson } from '../../tabs/model-converters/converters/fbx/canonical-json.js';
import { runZonePackageQualification } from '../../tabs/model-converters/converters/fbx/zone-package/qualification.js';

const geometryCount = Number(process.argv[2] || 200);
const report = await runZonePackageQualification({ geometryCount });
console.log(canonicalJson(report));
if (report.overallStatus !== 'PASS') process.exitCode = 1;
