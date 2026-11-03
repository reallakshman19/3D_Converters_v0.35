import { normalizeConversionConfig } from './conversion-config.js';

export function stringifyConversionConfig(config) {
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    config,
  }, null, 2);
}

export function parseConversionConfigText(text) {
  const parsed = JSON.parse(String(text || '{}'));
  const envelope = parsed?.config ? parsed.config : parsed;
  return normalizeConversionConfig(envelope);
}

export function downloadConversionConfig(config, fileName = 'interchange-conversion-config.json') {
  const text = stringifyConversionConfig(config);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export async function readConversionConfigFile(file) {
  const text = await file.text();
  return parseConversionConfigText(text);
}
