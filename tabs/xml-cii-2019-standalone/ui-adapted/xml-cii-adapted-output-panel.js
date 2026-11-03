import { createElement, createPre, lineCount } from './xml-cii-adapted-dom.js';

export function workflowPreviewText(state) {
  return state.result?.ciiText || state.result?.enrichedText || '';
}

export function workflowLogText(state) {
  return [
    state.result?.error || '',
    state.result?.diagnostics ? JSON.stringify(state.result.diagnostics, null, 2) : '',
    ...(state.result?.logs || []),
  ].filter(Boolean).join('\n');
}

export function renderOutputPanel(root, state) {
  const output = createElement('section', '', 'xml-cii-standalone-output');
  output.append(renderOutputPreview(state), renderLogPreview(state));
  root.appendChild(output);
}

export function renderOutputPreview(state) {
  const text = workflowPreviewText(state);
  const box = createElement('div');
  box.append(
    createElement('h2', 'Output preview'),
    createElement('div', `Output bytes: ${text.length.toLocaleString()} | lines: ${lineCount(text).toLocaleString()}`, 'xml-cii-file-summary'),
    createPre(text || 'No output yet.'),
  );
  return box;
}

export function renderLogPreview(state) {
  const box = createElement('div');
  box.append(
    createElement('h2', 'Logs / diagnostics'),
    createPre(workflowLogText(state) || 'No logs yet.'),
  );
  return box;
}
