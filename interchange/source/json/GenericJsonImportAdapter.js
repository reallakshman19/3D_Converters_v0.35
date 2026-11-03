import { SourceFileRecord } from '../SourceFileRecord.js';
import { SourceDialectInfo } from '../SourceDialectInfo.js';
import { parseJsonToTopoInput } from './json-topo-parser.js';
import { buildCanonicalProjectFromTopoSource } from '../../topo/topo-builder.js';
import { cloneDefaultTopoProfile } from '../../topo/topo-mapping-profiles.js';

export class GenericJsonImportAdapter {
  static detect(text) {
    const source = String(text || '').trim();
    if (!source) return false;
    if (!(source.startsWith('{') || source.startsWith('['))) return false;
    try {
      JSON.parse(source);
      return true;
    } catch {
      return false;
    }
  }

  static detectConfidence(input) {
    const text = String(input?.text || '');
    const name = String(input?.name || '');
    const byText = this.detect(text);
    const isLikelyPcfx = /"pcfx"|"canonical"|"assemblies"/i.test(text);
    if (isLikelyPcfx) return 0;
    if (byText && /\.json$/i.test(name)) return 0.88;
    if (byText) return 0.75;
    return 0;
  }

  async import({ id = '', name = 'input.json', text = '' } = {}) {
    const parsedTopo = parseJsonToTopoInput(text);
    const dialectInfo = new SourceDialectInfo({
      format: 'JSON',
      dialect: 'GENERIC_JSON_TOPO',
      units: 'SOURCE_DEFINED',
      axisConvention: 'SOURCE_DEFINED',
      metadata: {
        segmentCount: parsedTopo.segments.length,
        supportCount: parsedTopo.supports.length,
      },
    });

    const sourceRecord = new SourceFileRecord({
      id: id || `json-${Date.now()}`,
      name,
      format: 'JSON',
      dialect: dialectInfo.dialect,
      rawText: text,
      rawJson: parsedTopo.rawJson,
      metadata: { dialectInfo },
    });

    for (const message of parsedTopo.messages || []) {
      sourceRecord.addMessage(message.level || 'INFO', message.message || '', message.details || {});
    }

    const { project, topoGraph, supportSpecs } = buildCanonicalProjectFromTopoSource({
      sourceRecord,
      topoInput: parsedTopo,
      format: 'JSON',
      profileOverride: cloneDefaultTopoProfile('JSON'),
    });

    sourceRecord.addMessage('INFO', 'JSON source mapped through Topo Builder.', {
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
