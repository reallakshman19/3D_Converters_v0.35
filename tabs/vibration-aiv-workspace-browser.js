export function ensureAivQualificationStylesheet(documentRef = globalThis.document) {
  if (!documentRef || documentRef.querySelector('link[data-aiv-qualification-style="true"]')) return;
  const link = documentRef.createElement('link');
  link.rel = 'stylesheet';
  link.href = './tabs/vibration-aiv-qualification.css?v=aiv-qualification-15';
  link.dataset.aivQualificationStyle = 'true';
  documentRef.head.appendChild(link);
}

export function downloadAivText(text, fileName, type = 'text/csv;charset=utf-8', documentRef = globalThis.document) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = documentRef.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.hidden = true;
  documentRef.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}