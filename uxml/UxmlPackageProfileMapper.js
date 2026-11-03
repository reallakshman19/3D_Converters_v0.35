/**
 * Maps pipe-component-data package-dialect UXML (JSON-in-attribute sections,
 * e.g. <Components><Item data="{...}"/>) into the viewer's UXML document
 * shape. The package AdapterGraph shares this document's section model, so
 * mapping is a factory-normalized passthrough; unknown extras stay on each
 * object via the factory overrides.
 */

import { fromUxmlXml } from '../vendor/from-uxml-xml.js';
import {
  createUxmlComponent,
  createUxmlAnchor,
  createUxmlPort,
  createUxmlSegment,
  createUxmlSupport,
} from './UxmlTypes.js';

export function isPackageUxmlDialect(xmlText) {
  const text = String(xmlText || '');
  if (!/<UXML\b[^>]*schemaVersion="uxml-topology-v1"/i.test(text)) return false;
  return /<Item\s+data="/i.test(text) || /<Header\s+data="/i.test(text);
}

/**
 * Parse package-dialect UXML and merge its sections into the viewer doc.
 *
 * @param {string} xmlText  Package-dialect UXML text.
 * @param {Object} doc      Viewer UXML document (createUxmlDocument shape).
 * @param {string} sourceId Source reference for diagnostics.
 * @returns {Object} The same doc, populated.
 */
export function mapPackageUxmlToViewerDoc(xmlText, doc, sourceId) {
  const graph = fromUxmlXml(String(xmlText || ''));

  if (graph.header && typeof graph.header === 'object') {
    doc.header = { ...doc.header, ...graph.header };
  }
  if (graph.units && typeof graph.units === 'object') {
    doc.units = { ...doc.units, ...graph.units };
  }
  doc.pipelines = Array.isArray(graph.pipelines) ? [...graph.pipelines] : doc.pipelines;

  doc.components = (graph.components || []).map((component) =>
    createUxmlComponent({ ...component, sourceRefs: withSourceRef(component.sourceRefs, sourceId) }));
  doc.anchors = (graph.anchors || []).map((anchor) => createUxmlAnchor(anchor));
  doc.ports = (graph.ports || []).map((port) => createUxmlPort(port));
  doc.segments = (graph.segments || []).map((segment) => createUxmlSegment(segment));
  doc.supports = (graph.supports || []).map((support) => createUxmlSupport(support));

  for (const diagnostic of graph.diagnostics || []) {
    doc.diagnostics.push({ sourceId, ...diagnostic });
  }
  doc.diagnostics.push({
    severity: 'INFO',
    code: 'UXML-PACKAGE-DIALECT-PARSED',
    message: `Parsed pipe-component-data UXML dialect: ${doc.components.length} components, ${doc.anchors.length} anchors.`,
    sourceId,
  });

  return doc;
}

function withSourceRef(sourceRefs, sourceId) {
  const refs = Array.isArray(sourceRefs) ? [...sourceRefs] : [];
  refs.push({ sourceId, kind: 'package-uxml' });
  return refs;
}
