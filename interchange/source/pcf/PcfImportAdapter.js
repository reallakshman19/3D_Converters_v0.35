import { SourceFileRecord } from '../SourceFileRecord.js';
import { buildPcfCanonicalProject } from '../../builders/pcf/pcf-canonical-builder.js';

export class PcfImportAdapter {
  static detect(text) {
    const source = String(text || '');
    return /\b(?:PIPE|BEND|VALVE|FLANGE|ELBOW|TEE|REDUCER|ISOGEN-FILES|UNITS-CO-ORDS|END-POINT)\b/i.test(source);
  }

  static detectConfidence(input) {
    const text = String(input?.text || '');
    const name = String(input?.name || '');
    const byText = this.detect(text);
    if (byText && /\.pcf$/i.test(name)) return 1.0;
    if (byText) return 0.85;
    if (/\.pcf$/i.test(name)) return 0.4;
    return 0;
  }

  async import({ id = '', name = 'input.pcf', text = '' } = {}) {
    const sourceRecord = new SourceFileRecord({
      id: id || `pcf-${Date.now()}`,
      name,
      format: 'PCF',
      dialect: 'GENERIC_PCF',
      rawText: text,
    });
    sourceRecord.addMessage('INFO', 'PCF source ingested.');
    const parsed = { rawText: text };
    const project = buildPcfCanonicalProject({ sourceRecord, parsed });
    return { sourceRecord, parsed, project };
  }
}
