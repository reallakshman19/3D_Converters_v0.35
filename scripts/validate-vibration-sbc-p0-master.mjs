import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  qualifySbcT3P0SuppliedCandidate,
} from '../converters/vibration/sbc/t3-p0-source-gate.js';

export function validateVibrationSbcP0Master() {
  const qualification = qualifySbcT3P0SuppliedCandidate();
  console.log(JSON.stringify(qualification, null, 2));
  if (!qualification.masterPublicationAuthorized) {
    const error = new Error('SBC T3 P0 master publication is blocked by source-data conflict.');
    error.code = 'SBC_T3_P0_MASTER_NOT_QUALIFIED';
    throw error;
  }
  return qualification;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
const scriptPath = resolve(fileURLToPath(import.meta.url));
if (invokedPath === scriptPath) {
  try {
    validateVibrationSbcP0Master();
  } catch (error) {
    console.error(`[sbc-p0-master] ${error.code ?? 'VALIDATION_FAILED'}: ${error.message}`);
    process.exitCode = 2;
  }
}
