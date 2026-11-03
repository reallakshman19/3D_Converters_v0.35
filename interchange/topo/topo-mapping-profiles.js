/**
 * topo-mapping-profiles.js
 * Format-scoped mapping profile defaults for Topo Builder.
 */

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export const DEFAULT_TOPO_MAPPING_PROFILES = Object.freeze({
  REV: {
    component: {
      idTemplate: '{{source.id || source.index}}',
      refNoTemplate: '{{raw.CA97 || source.id || source.index}}',
      seqNoTemplate: '{{raw.CA98 || source.index}}',
      pipelineRefTemplate: '{{raw.PIPELINE_REFERENCE || raw.LINE_NO || raw.groupPath || "REV-LINE"}}',
      lineNoKeyTemplate: '{{raw.LINE_NO || raw.groupPath || raw.PIPELINE_REFERENCE || "REV-LINE"}}',
      sKeyTemplate: '{{raw.SKEY || raw.ITEM_CODE || source.type || "PIPE"}}'
    },
    support: {
      idTemplate: '{{source.id || source.index}}',
      supportKindTemplate: '{{raw.SKEY || raw.ITEM_CODE || raw.groupPath || "SUPPORT"}}',
      orientationTemplate: '{{raw.SUPPORT_DIRECTION || raw.direction || "UNKNOWN"}}',
      sizeTemplate: '{{raw.SIZE || raw.bore || ""}}'
    }
  },
  JSON: {
    component: {
      idTemplate: '{{source.path || source.id || source.index}}',
      refNoTemplate: '{{raw.CA97 || source.path || source.index}}',
      seqNoTemplate: '{{raw.CA98 || source.index}}',
      pipelineRefTemplate: '{{raw.pipelineRef || raw.lineNo || raw.LINE_NO || "JSON-LINE"}}',
      lineNoKeyTemplate: '{{raw.lineNo || raw.LINE_NO || raw.pipelineRef || "JSON-LINE"}}',
      sKeyTemplate: '{{raw.sKey || raw.SKEY || source.type || "PIPE"}}'
    },
    support: {
      idTemplate: '{{source.path || source.id || source.index}}',
      supportKindTemplate: '{{raw.sKey || raw.SKEY || raw.supportType || "SUPPORT"}}',
      orientationTemplate: '{{raw.supportDirection || raw.direction || "UNKNOWN"}}',
      sizeTemplate: '{{raw.size || raw.bore || ""}}'
    }
  },
  XML: {
    component: {
      idTemplate: '{{source.id || source.index}}',
      refNoTemplate: '{{raw.CA97 || source.id || source.index}}',
      seqNoTemplate: '{{raw.CA98 || source.index}}',
      pipelineRefTemplate: '{{raw.LINE_NO || raw.LINE_NO_KEY || "XML-LINE"}}',
      lineNoKeyTemplate: '{{raw.LINE_NO_KEY || raw.LINE_NO || "XML-LINE"}}',
      sKeyTemplate: '{{raw.SKEY || source.type || "PIPE"}}'
    },
    support: {
      idTemplate: '{{source.id || source.index}}',
      supportKindTemplate: '{{raw.SUPPORT_NAME || raw.TYPE || "SUPPORT"}}',
      orientationTemplate: '{{raw.SUPPORT_DIRECTION || raw.TYPE || "UNKNOWN"}}',
      sizeTemplate: '{{raw.SIZE || raw.OD || ""}}'
    }
  }
});

export function cloneDefaultTopoProfile(formatKey) {
  const key = String(formatKey || '').toUpperCase();
  const fallback = DEFAULT_TOPO_MAPPING_PROFILES.XML;
  const selected = DEFAULT_TOPO_MAPPING_PROFILES[key] || fallback;
  return cloneJson(selected);
}
