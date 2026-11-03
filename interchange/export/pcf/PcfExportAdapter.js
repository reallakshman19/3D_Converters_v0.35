import { FidelityClass } from '../../canonical/FidelityClass.js';
import { buildLossContract } from '../../validation/LossContractEvaluator.js';
import { buildExportResult } from '../common/export-result.js';
import { getConversionConfig } from '../../config/conversion-config-store.js';

function valueByPrecedence(seg, keys = [], precedence = ['normalized', 'raw', 'defaults'], fallback = '') {
  for (const token of precedence) {
    if (token === 'normalized') {
      for (const key of keys) {
        const value = seg.normalized?.[key];
        if (value !== undefined && value !== null && String(value) !== '') return value;
      }
    }
    if (token === 'raw') {
      for (const key of keys) {
        const value = seg.rawAttributes?.[key];
        if (value !== undefined && value !== null && String(value) !== '') return value;
      }
    }
  }
  return fallback;
}

export class PcfExportAdapter {
  constructor({ config } = {}) {
    this.config = config || getConversionConfig();
  }

  export(project, { config } = {}) {
    const effectiveConfig = config || this.config || getConversionConfig();
    const precedence = effectiveConfig.exportPolicy?.precedence || ['normalized', 'raw', 'defaults'];
    const losses = [];
    const lines = ['ISOGEN-FILES ISOGEN.FLS'];

    for (const seg of project.segments || []) {
      const lineRef = valueByPrecedence(seg, ['lineNoKey', 'lineRef'], precedence, seg.lineRef || '');
      lines.push('PIPE');
      lines.push(`    COMPONENT-IDENTIFIER ${seg.id}`);
      lines.push(`    FROM-NODE ${seg.fromNodeId || '0'}`);
      lines.push(`    TO-NODE ${seg.toNodeId || '0'}`);
      if (lineRef) lines.push(`    LINE-NO ${lineRef}`);
      const sKey = valueByPrecedence(seg, ['sKey'], precedence, '');
      if (sKey) lines.push(`    SKEY ${sKey}`);

      const lossContract = buildLossContract({
        objectId: seg.id,
        sourceFormat: project.metadata?.format || 'UNKNOWN',
        targetFormat: 'PCF',
        fidelityClass: seg.fidelity || FidelityClass.RECONSTRUCTED,
        rawPreserved: !!Object.keys(seg.rawAttributes || {}).length,
        normalizedPreserved: true,
      });
      losses.push({
        code: 'PCF_EXPORT_LOSS',
        severity: lossContract.fidelityClass === FidelityClass.RECONSTRUCTED ? 'warning' : 'info',
        sourceObjectId: seg.id,
        sourceKind: 'segment',
        targetFormat: 'PCF',
        preserved: ['topology', 'lineRef', 'sKey'],
        dropped: lossContract.droppedFields || ['customMetadata']
      });
    }
    return buildExportResult({
      text: lines.join('\n'),
      losses,
      meta: {
        producer: 'PcfExportAdapter',
        sourceFormat: project.metadata?.format || 'UNKNOWN',
        targetFormat: 'PCF'
      }
    });
  }
}
