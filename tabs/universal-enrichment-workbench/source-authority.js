import { normalizeSourceText } from './source-text.js';

export function createWorkbenchState() {
  return {
    sourceText: '', normalizedText: '', sourceName: '', origin: '',
    revision: 0, selectedKind: 'auto', envelope: null, pendingPaste: false,
  };
}

export function acceptAuthoritativeText(state, input) {
  const sourceText = String(input.sourceText ?? '');
  const normalizedText = normalizeSourceText(sourceText);
  const changed = normalizedText !== state.normalizedText;
  const revision = changed ? Math.max(1, state.revision + 1) : state.revision;
  const sourceName = input.sourceName || state.sourceName;
  const origin = input.origin || state.origin;
  const metadataChanged = sourceName !== state.sourceName || origin !== state.origin;
  return {
    ...state, sourceText, normalizedText, revision, sourceName, origin,
    envelope: changed || metadataChanged ? null : state.envelope,
    pendingPaste: false,
  };
}

export function selectSourceKind(state, selectedKind) {
  if (state.selectedKind === selectedKind) return state;
  return { ...state, selectedKind, envelope: null };
}

export async function readSourceFile(file, readFile = (source) => source.text()) {
  if (!file) throw new Error('A source file is required.');
  return { sourceName: file.name || 'untitled-source', sourceText: await readFile(file) };
}

export function clearWorkbenchState() {
  return createWorkbenchState();
}
