import { makeProductionFixture } from '../production/production-fixture.mjs';
import {
  runTopoEnrichedXmlProduction,
  serializeProductionResult,
} from '../../../../tabs/stagedjson-to-enrichxml/production/topo-enriched-xml-production.js';

const requestedWriter = String(process.argv[2] || 'CANONICAL').toUpperCase();
if (!['CANONICAL', 'SEQUENTIAL'].includes(requestedWriter)) {
  throw new Error(`Unsupported requested writer: ${requestedWriter}`);
}
const input = await makeProductionFixture({ requestedWriter });
const result = await runTopoEnrichedXmlProduction(input);
if (result.validation.status !== 'PASS' || !result.productionBundle) {
  throw new Error(`TE-013 fixture did not produce a strict bundle: ${JSON.stringify(result.validation)}`);
}
process.stdout.write(serializeProductionResult(result));
