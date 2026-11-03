export function buildExportResult({ text, blob, losses, warnings, meta }) {
  return {
    ok: true,
    text: text || null,
    blob: blob || null,
    losses: losses || [],
    warnings: warnings || [],
    meta: {
      producedAt: new Date().toISOString(),
      ...meta,
    },
  };
}
