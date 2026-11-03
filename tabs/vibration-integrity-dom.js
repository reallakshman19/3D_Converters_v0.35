export function ensureVibrationIntegrityStylesheet() {
  if (document.querySelector('link[data-vibration-integrity-style="true"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './tabs/vibration-integrity.css?v=vibration-integrity-2';
  link.dataset.vibrationIntegrityStyle = 'true';
  document.head.appendChild(link);
}

export function downloadVibrationIntegrityText(text, fileName, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.hidden = true;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
