import {
  BROWSER_RVM_ATT_PARSER_SCHEMA,
  matchBrowserRvmAttAttributes,
  parseBrowserRvmAttText,
  summarizeBrowserRvmAtt
} from './BrowserRvmAttParser.js';

export const BROWSER_RVM_ATT_ENRICHER_SCHEMA = 'browser-rvm-att-enricher/v1';

export function enrichBrowserRvmHierarchyWithAtt(hierarchy = [], attText = '') {
  const parsedAtt = parseBrowserRvmAttText(attText || '');
  const summary = summarizeBrowserRvmAtt(parsedAtt);
  const attAvailable = summary.globalAttributeCount > 0 || summary.ownerAttributeCount > 0;
  let enrichedNodeCount = 0;
  let matchedOwnerCount = 0;

  const roots = (Array.isArray(hierarchy) ? hierarchy : []).map((root) => cloneAndEnrichNode(root, {
    parsedAtt,
    attAvailable,
    onEnriched(matchCount) {
      enrichedNodeCount += 1;
      if (matchCount > summary.globalAttributeCount) matchedOwnerCount += 1;
    }
  }));

  return {
    schemaVersion: BROWSER_RVM_ATT_ENRICHER_SCHEMA,
    hierarchy: roots,
    parsedAtt,
    diagnostics: {
      schemaVersion: BROWSER_RVM_ATT_ENRICHER_SCHEMA,
      attParserSchemaVersion: BROWSER_RVM_ATT_PARSER_SCHEMA,
      attAvailable,
      globalAttributeCount: summary.globalAttributeCount,
      ownerCount: summary.ownerCount,
      ownerAttributeCount: summary.ownerAttributeCount,
      enrichedNodeCount,
      matchedOwnerCount
    }
  };
}

function cloneAndEnrichNode(node, ctx) {
  if (!node || typeof node !== 'object') return node;
  const children = Array.isArray(node.children) ? node.children.map((child) => cloneAndEnrichNode(child, ctx)) : [];
  const attrs = { ...(node.attributes || {}) };
  const ownerName = ownerNameForNode(node, attrs);
  const attAttrs = ctx.attAvailable ? matchBrowserRvmAttAttributes(ctx.parsedAtt, ownerName) : {};
  const attKeys = Object.keys(attAttrs);

  if (attKeys.length) {
    for (const [key, value] of Object.entries(attAttrs)) {
      if (attrs[key] == null || attrs[key] === '') attrs[key] = value;
    }
    attrs.RVM_BROWSER_ATT_ENRICHED = 'true';
    attrs.RVM_BROWSER_ATT_ENRICHER_SCHEMA = BROWSER_RVM_ATT_ENRICHER_SCHEMA;
    attrs.RVM_BROWSER_ATT_OWNER_QUERY = ownerName;
    attrs.RVM_BROWSER_ATT_ATTRIBUTE_COUNT = String(attKeys.length);
    ctx.onEnriched?.(attKeys.length);
  }

  return {
    ...node,
    attributes: attrs,
    children
  };
}

function ownerNameForNode(node, attrs) {
  const owner = String(attrs.RVM_OWNER_NAME || attrs.RVM_OWNER_PATH || '').trim();
  if (owner) return owner;
  const branchPath = String(attrs.RVM_BROWSER_BRANCH_PATH || '').trim();
  if (branchPath) return branchPath;
  return String(node?.name || attrs.NAME || '').trim();
}
