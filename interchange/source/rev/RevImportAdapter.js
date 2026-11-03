import { SourceFileRecord } from '../SourceFileRecord.js';
import { SourceDialectInfo } from '../SourceDialectInfo.js';
import { parseRevToTopoInput } from './rev-text-parser.js';
import { buildCanonicalProjectFromTopoSource } from '../../topo/topo-builder.js';
import { cloneDefaultTopoProfile } from '../../topo/topo-mapping-profiles.js';

export class RevImportAdapter {
  static detect(text) {
    const source = String(text || '');
    return /\bHEAD\b/.test(source)
      && /\bMODL\b/.test(source)
      && /\b(PRIM|OBST|INSU)\b/.test(source);
  }

  static detectConfidence(input) {
    const text = String(input?.text || '');
    const name = String(input?.name || '');
    const byText = this.detect(text);
    if (byText && /\.rev$/i.test(name)) return 1.0;
    if (byText) return 0.92;
    if (/\.rev$/i.test(name)) return 0.55;
    return 0;
  }

  async import({ id = '', name = 'input.rev', text = '' } = {}) {
    const parsedTopo = parseRevToTopoInput(text);
    const dialectInfo = new SourceDialectInfo({
      format: 'REV',
      dialect: 'RVM_REV_TEXT',
      units: 'SOURCE_DEFINED',
      axisConvention: 'SOURCE_DEFINED',
      metadata: {
        segmentCount: parsedTopo.segments.length,
        supportCount: parsedTopo.supports.length,
      },
    });

    const sourceRecord = new SourceFileRecord({
      id: id || `rev-${Date.now()}`,
      name,
      format: 'REV',
      dialect: dialectInfo.dialect,
      rawText: text,
      metadata: { dialectInfo },
    });

    for (const msg of parsedTopo.messages || []) {
      sourceRecord.addMessage(msg.level || 'INFO', msg.message || '', msg.details || {});
    }

    const { project, topoGraph, supportSpecs } = buildCanonicalProjectFromTopoSource({
      sourceRecord,
      topoInput: parsedTopo,
      format: 'REV',
      profileOverride: cloneDefaultTopoProfile('REV'),
    });

    sourceRecord.addMessage('INFO', 'REV source mapped through Topo Builder.', {
      topo: {
        nodes: topoGraph.nodes.length,
        segments: topoGraph.segments.length,
        components: topoGraph.components.length,
      },
      supportSpecs: supportSpecs.length,
    });

    return {
      sourceRecord,
      parsed: {
        topoInput: parsedTopo,
        topoGraph,
        supportSpecs,
      },
      project,
      diagnostics: {
        source: sourceRecord.messages,
        canonical: project?.diagnostics?.messages || [],
      },
    };
  }
}
