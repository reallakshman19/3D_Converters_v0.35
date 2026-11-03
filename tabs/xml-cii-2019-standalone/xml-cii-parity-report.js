export const XML_CII_PARITY_SCHEMA = 'xml-cii-2019-standalone-parity/v1';

export function normalizeXmlForParity(value) {
  return String(value || '')
    .replace(/^\s*<\?xml[^>]*>\s*/i, '')
    .replace(/\r\n|\r/g, '\n')
    .replace(/>\s+</g, '><')
    .replace(/\s+\/>/g, '/>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function createSemanticTokenResult(actualText, referenceText, tokens = []) {
  const actual = normalizeXmlForParity(actualText);
  const reference = normalizeXmlForParity(referenceText);
  const missingFromActual = tokens.filter((token) => !actual.includes(token));
  const missingFromReference = tokens.filter((token) => !reference.includes(token));
  return {
    ok: missingFromActual.length === 0 && missingFromReference.length === 0,
    missingFromActual,
    missingFromReference,
  };
}

export function createXmlCiiParityCaseReport(input) {
  const tokenResult = createSemanticTokenResult(input.actualText, input.referenceText, input.requiredTokens || []);
  const diagnosticsBranch = input.diagnostics?.branch || null;
  const branchOk = diagnosticsBranch === input.expectedDiagnosticsBranch;
  const outputKindOk = input.actualOutputKind === input.expectedOutputKind;
  return {
    fixtureName: input.fixtureName,
    sourceKind: input.sourceKind,
    standaloneBranch: input.standaloneBranch || diagnosticsBranch,
    expectedOutputKind: input.expectedOutputKind,
    actualOutputKind: input.actualOutputKind,
    normalizedSemanticMatch: tokenResult.ok && branchOk && outputKindOk,
    knownIntentionalDivergences: input.knownIntentionalDivergences || [],
    diagnosticsBranch,
    missingFromActual: tokenResult.missingFromActual,
    missingFromReference: tokenResult.missingFromReference,
  };
}

export function createXmlCiiParityReport(cases) {
  const caseReports = cases.map(createXmlCiiParityCaseReport);
  const blockers = caseReports
    .filter((item) => !item.normalizedSemanticMatch)
    .map((item) => `${item.fixtureName} failed normalized semantic parity`);
  return {
    schema: XML_CII_PARITY_SCHEMA,
    ok: blockers.length === 0,
    checkedAt: new Date().toISOString(),
    cases: caseReports,
    totals: {
      caseCount: caseReports.length,
      matchedCount: caseReports.filter((item) => item.normalizedSemanticMatch).length,
      divergenceCount: caseReports.reduce((sum, item) => sum + item.knownIntentionalDivergences.length, 0),
    },
    blockers,
  };
}
