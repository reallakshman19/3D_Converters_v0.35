import { buildExportResult } from '../common/export-result.js';
import { getConversionConfig } from '../../config/conversion-config-store.js';

export class PcfxExportAdapter {
  constructor({ config } = {}) {
    this.config = config || getConversionConfig();
  }

  export(project, { config } = {}) {
    const effectiveConfig = config || this.config || getConversionConfig();
    const losses = [];
    if (!project.metadata) {
      losses.push({
        code: 'PCFX_NO_METADATA',
        severity: 'info',
        sourceObjectId: project.id,
        sourceKind: 'project',
        targetFormat: 'PCFX',
        preserved: ['all'],
        dropped: ['metadata']
      });
    }

    const envelope = {
      pcfx: true,
      profile: effectiveConfig.profile?.xmlProfile || 'XML(PCFX1)',
      conversionConfigVersion: effectiveConfig.profile?.schemaVersion || 'unknown',
      exportedAt: new Date().toISOString(),
      project,
    };

    return buildExportResult({
      text: JSON.stringify(envelope, null, 2),
      losses,
      meta: {
        producer: 'PcfxExportAdapter',
        sourceFormat: project.metadata?.format || 'UNKNOWN',
        targetFormat: 'PCFX'
      }
    });
  }
}
