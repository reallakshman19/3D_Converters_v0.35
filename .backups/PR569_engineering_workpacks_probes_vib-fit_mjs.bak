import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

async function importFromRoot(root, path) {
  return import(pathToFileURL(resolve(root, path)).href);
}

async function definitionFrom(context) {
  const module = await importFromRoot(context.root, context.workpack.adapter.path);
  return module[context.workpack.adapter.exportName];
}

function runProbe(definition, probe, mode = 'screening') {
  return definition.calculate(probe.input, { options: { qualificationMode: mode } });
}

async function authorityProjectionFailures(context) {
  const failures = [];
  for (const rule of context.workpack.authorityProjectionModules ?? []) {
    const module = await importFromRoot(context.root, rule.path);
    const projection = module[rule.exportName]?.[rule.authorityProperty];
    for (const field of rule.fields) {
      if (projection?.[field] !== context.workpack.authority[field]) failures.push(`${rule.path}:${field}`);
    }
  }
  return failures;
}

export async function verifyScreeningAuthority(context) {
  const definition = await definitionFrom(context);
  const result = runProbe(definition, context.workpack.probes.screening);
  const expected = context.workpack.authority;
  const projectionFailures = await authorityProjectionFailures(context);
  const ok = result.ok === true
    && definition.authority?.calculationState === expected.calculationState
    && definition.authority?.qualificationState === expected.qualificationState
    && result.qualification?.effective === expected.qualificationState
    && result.provenance?.engineeringAuthority === expected.engineeringAuthority
    && result.assessment?.screeningAuthority === expected.screeningAuthority
    && projectionFailures.length === 0;
  return {
    ok,
    detail: projectionFailures.length
      ? `authority projection drift: ${projectionFailures.join(', ')}`
      : 'bounded screening authority and machine projections match work pack',
  };
}

export async function verifyDesignAuthority(context) {
  const definition = await definitionFrom(context);
  const result = runProbe(definition, context.workpack.probes.screening);
  const ok = context.workpack.authority.designAuthority === false
    && result.qualification?.designAuthority === false
    && result.assessment?.designAuthority === false;
  return { ok, detail: 'designAuthority remains false in contract and screening result' };
}

export async function verifyCodeCompliance(context) {
  const definition = await definitionFrom(context);
  const ok = context.workpack.authority.codeCompliance === false
    && definition.authority?.codeCompliance === false;
  return { ok, detail: 'codeCompliance remains false' };
}

export async function verifyQst003(context) {
  const definition = await definitionFrom(context);
  const result = runProbe(definition, context.workpack.probes.qst003);
  const expected = context.workpack.probes.qst003.expectedPublicErrorCode;
  const codes = (result.errors ?? []).map((error) => error.code);
  return {
    ok: result.ok === false && codes.includes(expected),
    detail: `QST-003 fails closed with ${expected}`,
  };
}

export async function verifyProductFreeze(context) {
  const freeze = context.workpack.productFreeze;
  await access(resolve(context.root, freeze.protocolPath));
  if (freeze.state !== 'FROZEN') {
    const ok = freeze.state === 'BLOCKED'
      && freeze.frozen === false
      && freeze.qualificationIndependent === true;
    return { ok, detail: 'Product Freeze remains BLOCKED and separate from method qualification' };
  }
  const receipt = JSON.parse(await readFile(resolve(context.root, freeze.receiptPath), 'utf8'));
  const ok = freeze.frozen === true
    && freeze.qualificationIndependent === true
    && receipt.schema === freeze.requiredReceiptSchema
    && receipt.status === freeze.requiredReceiptStatus;
  return { ok, detail: 'FROZEN requires the protocol-defined PASS receipt' };
}
