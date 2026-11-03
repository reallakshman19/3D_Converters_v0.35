export function normalizeMasterSourceText(value) {
  return String(value ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

export function createMasterInputState() {
  return {
    sourceText: '', normalizedText: '', sourceName: '', origin: '', revision: 0,
    sourceKind: 'csv', datasetRole: 'custom', pendingPaste: false,
  };
}

export function acceptMasterText(state, input) {
  const sourceText = String(input.sourceText ?? '');
  const normalizedText = normalizeMasterSourceText(sourceText);
  const changed = normalizedText !== state.normalizedText;
  return {
    ...state,
    sourceText,
    normalizedText,
    sourceName: input.sourceName || state.sourceName,
    origin: input.origin || state.origin,
    revision: changed ? Math.max(1, state.revision + 1) : state.revision,
    pendingPaste: false,
  };
}

export async function readMasterFile(file, readFile = (source) => source.text()) {
  if (!file) throw new Error('A master file is required.');
  return { sourceName: file.name || 'untitled-master', sourceText: await readFile(file) };
}
