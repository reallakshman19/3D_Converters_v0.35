import { buildExportResult } from '../common/export-result.js';
import { getConversionConfig } from '../../config/conversion-config-store.js';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function buildObjectLines(tag, items, mapFn) {
  return (items || []).map((item) => `  <${tag} ${mapFn(item)} />`).join('\n');
}

export class XmlExportAdapter {
  constructor({ config } = {}) {
    this.config = config || getConversionConfig();
  }

  export(project, { config } = {}) {
    const effectiveConfig = config || this.config || getConversionConfig();
    const losses = [];
    const profile = effectiveConfig.profile?.xmlProfile || 'XML(PCFX1)';
    const units = effectiveConfig.profile?.units || 'mm';

    const segmentsXml = buildObjectLines('Segment', project.segments, (seg) => {
      if (effectiveConfig.exportPolicy?.emitLossContracts) {
        losses.push({
          code: 'XML_SEGMENT_EXPORT',
          severity: 'info',
          sourceObjectId: seg.id,
          sourceKind: 'segment',
          targetFormat: 'XML',
          preserved: ['normalized', 'rawAttributes', 'lineRef'],
          dropped: [],
        });
      }
      return [
        `id="${esc(seg.id)}"`,
        `fromNodeId="${esc(seg.fromNodeId)}"`,
        `toNodeId="${esc(seg.toNodeId)}"`,
        `lineRef="${esc(seg.lineRef || seg.normalized?.lineNoKey || '')}"`,
        `sKey="${esc(seg.normalized?.sKey || '')}"`,
      ].join(' ');
    });

    const supportsXml = buildObjectLines('Support', project.supports, (support) => [
      `id="${esc(support.id)}"`,
      `hostRef="${esc(support.hostRef || '')}"`,
      `hostRefType="${esc(support.hostRefType || '')}"`,
      `kind="${esc(support.normalized?.supportKind || support.metadata?.kind || '')}"`,
    ].join(' '));

    const annotationsXml = buildObjectLines('Annotation', project.annotations, (annotation) => [
      `id="${esc(annotation.id)}"`,
      `annotationType="${esc(annotation.annotationType || '')}"`,
      `anchorRef="${esc(annotation.anchorRef || '')}"`,
      `text="${esc(annotation.text || '')}"`,
    ].join(' '));

    const assembliesXml = (project.assemblies || []).map((asm) => `  <Assembly id="${esc(asm.id)}" name="${esc(asm.name)}" />`).join('\n');

    const text = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<Project profile="${esc(profile)}" units="${esc(units)}" id="${esc(project.id)}" name="${esc(project.name)}">`,
      assembliesXml,
      segmentsXml,
      supportsXml,
      annotationsXml,
      `  <Diagnostics messageCount="${(project.diagnostics?.messages || []).length}" />`,
      '</Project>',
    ].filter(Boolean).join('\n');

    return buildExportResult({
      text,
      losses,
      meta: {
        producer: 'XmlExportAdapter',
        sourceFormat: project.metadata?.format || 'UNKNOWN',
        targetFormat: 'XML',
        xmlProfile: profile,
      }
    });
  }
}
