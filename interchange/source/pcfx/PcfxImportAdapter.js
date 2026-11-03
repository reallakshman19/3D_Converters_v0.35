import { SourceFileRecord } from '../SourceFileRecord.js';
import { buildPcfxCanonicalProject } from '../../builders/pcfx/pcfx-canonical-builder.js';

export class PcfxImportAdapter {
  static detect(text) {
    return /"pcfx"|"assemblies"|"canonical"/i.test(text || '');
  }

  async import({ id = '', name = 'input.pcfx.json', text = '' } = {}) {
    const sourceRecord = new SourceFileRecord({
      id: id || `pcfx-${Date.now()}`,
      name,
      format: 'PCFX',
      dialect: 'JSON_PCfX',
      rawText: text,
      rawJson: JSON.parse(text || '{}'),
    });
    sourceRecord.addMessage('INFO', 'PCFX source ingested.');
    const parsed = sourceRecord.rawJson;
    const project = buildPcfxCanonicalProject({ sourceRecord, parsed });
    return { sourceRecord, parsed, project };
  }
}
