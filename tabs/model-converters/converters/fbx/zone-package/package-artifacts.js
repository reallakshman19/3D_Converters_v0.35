import { canonicalJson } from '../canonical-json.js';
import {
  packageArtifactOmissionReason,
  packageArtifactRoleInventory,
  packageArtifactSpecForRole,
  validatePackageArtifactValue,
} from './artifact-roles.js';

function textFile(path, text) {
  return { path, bytes: new TextEncoder().encode(text) };
}

export function buildPackageArtifactFiles(artifacts = {}, omissionReasons = {}) {
  const files = [], omitted = [];
  for (const item of packageArtifactRoleInventory(artifacts)) {
    const value = artifacts[item.role];
    if (value === null || value === undefined) {
      omitted.push({
        role: item.role,
        path: item.path,
        disposition: 'OMITTED_BLOCKED',
        sha256: null,
        byteLength: 0,
        reason: packageArtifactOmissionReason(item.role, omissionReasons),
      });
      continue;
    }
    validatePackageArtifactValue(item.role, value);
    files.push({ role: item.role, ...textFile(item.path, canonicalJson(value)) });
  }
  return { files, omitted };
}

export function parsePackagedArtifact(role, bytes) {
  const spec = packageArtifactSpecForRole(role);
  if (!spec) throw new TypeError(`Unknown selected-zone package artifact role ${String(role)}.`);
  let value;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    throw new TypeError(`${role} is invalid JSON: ${error?.message || error}`);
  }
  validatePackageArtifactValue(role, value);
  return value;
}
