import { extractInputXmlBranches } from './InputXmlBranchExtractor.js';
import { buildExportScene } from '../../js/pcf2glb/glb/buildExportScene.js';
import { exportSceneToGLB } from '../../js/pcf2glb/glb/exportSceneToGLB.js';
import { applyInputXmlBendMetadata } from './InputXmlBendMetadata.js';
import { applyInputXmlCaesarSupportMetadata } from './InputXmlCaesarSupportMetadata.js';
import { appendInputXmlGlbNodeLabels } from './InputXmlGlbNodeLabels.js';
import { adaptUxmlToGlbModel } from './UxmlToGlbModelAdapter.js';
import { applyBmCiiSupportAnnotationEnrichment } from './BmCiiSupportAnnotationEnrichment.js';

const FORCED_GLB_VISUAL_PROFILE = 'basic-only';

function text(value) {
  return String(value ?? '').trim();
}

async function readFileText(file) {
  if (typeof file?.text === 'string') return file.text;
  if (file?.bytes instanceof Uint8Array) return new TextDecoder('utf-8').decode(file.bytes);
  if (file?.bytes instanceof ArrayBuffer) return new TextDecoder('utf-8').decode(new Uint8Array(file.bytes));
  if (typeof file?.file?.text === 'function') return file.file.text();
  if (typeof file?.text === 'function') return file.text();
  return '';
}

function baseName(name) {
  const normalized = text(name) || 'inputxml-model';
  return normalized.replace(/\.[^.]+$/, '') || 'inputxml-model';
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function blobLikeToArrayBuffer(value) {
  if (value instanceof ArrayBuffer) return value;
  if (value?.buffer instanceof ArrayBuffer && value?.byteLength !== undefined) {
    return value.buffer.slice(value.byteOffset || 0, (value.byteOffset || 0) + value.byteLength);
  }
  if (typeof value?.arrayBuffer === 'function') return value.arrayBuffer();
  throw new Error('GLB exporter did not return Blob or ArrayBuffer output.');
}

function createSceneLog(stdout, stderr) {
  return {
    warn(code, payload = {}) {
      stdout.push(`WARN ${code}: ${JSON.stringify(payload)}`);
    },
    error(code, payload = {}) {
      stderr.push(`ERROR ${code}: ${JSON.stringify(payload)}`);
    },
  };
}

function suppressComponentLabel(component) {
  component.label = '';
  component.name = '';
  component.attributes = { ...(component.attributes || {}), EXPORT_LABEL: false };
  component.raw = { ...(component.raw || {}), EXPORT_LABEL: false };
}

function applyLabelExportOptions(model, options = {}) {
  const stats = { nodeLabelsSuppressed: 0, supportLabelsSuppressed: 0, componentLabelsSuppressed: 0 };
  const showSupportLabels = options.showSupportLabels !== false && options.exportRestraintText !== false;
  const showComponentLabels = options.showComponentLabels !== false && options.exportComponentText !== false;

  for (const component of model.components || []) {
    const type = text(component.type).toUpperCase();
    if (type === 'NODE_LABEL' && options.exportNodeLabels === false) {
      suppressComponentLabel(component);
      stats.nodeLabelsSuppressed += 1;
    } else if (type === 'SUPPORT' && !showSupportLabels) {
      suppressComponentLabel(component);
      stats.supportLabelsSuppressed += 1;
    } else if (!['PIPE', 'SUPPORT', 'NODE_LABEL'].includes(type) && !showComponentLabels) {
      suppressComponentLabel(component);
      stats.componentLabelsSuppressed += 1;
    }
  }

  return stats;
}

function supportKindFromComponent(component = {}) {
  const attrs = { ...(component.raw || {}), ...(component.attributes || {}) };
  return text(
    component.supportKind
    || attrs.supportKind
    || attrs.SUPPORT_KIND
    || attrs.CAESAR_SUPPORT_KIND
    || attrs.CMPSUPTYPE
    || attrs.INPUTXML_SUPPORT_KIND
    || attrs.kind
  ).toUpperCase() || 'UNKNOWN';
}

function summarizeModelComponents(model = {}) {
  const summary = {
    componentCount: 0,
    typeCounts: {},
    supportKindCounts: {},
  };
  for (const component of model.components || []) {
    const type = text(component.type).toUpperCase() || 'UNKNOWN';
    summary.componentCount += 1;
    summary.typeCounts[type] = (summary.typeCounts[type] || 0) + 1;
    if (type === 'SUPPORT') {
      const supportKind = supportKindFromComponent(component);
      summary.supportKindCounts[supportKind] = (summary.supportKindCounts[supportKind] || 0) + 1;
    }
  }
  return summary;
}

function bmCiiSupportAnnotationSummary(options = {}) {
  if (!options.bmCiiSupportAnnotationTool) return null;
  const isonoteText = text(options.bmCiiIsonoteSideloadText);
  const lineNoText = text(options.bmCiiLineNoSideloadText);
  const bundleText = text(options.bmCiiSideloadBundleText);
  return {
    schema: 'bm-cii-support-annotation-options/v1',
    enabled: true,
    mode: text(options.bmCiiSupportMode) || 'inputxml-actual',
    sideloadBundleName: text(options.bmCiiSideloadBundleName),
    isonoteSideloadLineCount: isonoteText ? isonoteText.split(/\r?\n/).filter(Boolean).length : 0,
    lineNoSideloadLineCount: lineNoText ? lineNoText.split(/\r?\n/).filter(Boolean).length : 0,
    sideloadBundleLineCount: bundleText ? bundleText.split(/\r?\n/).filter(Boolean).length : 0,
    singleAxisZDecision: text(options.bmCiiSingleAxisZDecision) || 'warning',
    supportMappingContract: text(options.bmCiiSupportMappingContract) || 'common-inputxml-support-mapper/v3',
    axialResolver: text(options.bmCiiAxialResolver) || 'engineering-contact-first-then-ODx2over3-only-if-pipe-parallel',
    rules: {
      rest: 'REST is always +Y upward.',
      holddown: 'HOLDDOWN is vertical double-arrow ±Y.',
      guide: 'Horizontal X pipe -> ±Z; horizontal Z pipe -> ±X; vertical pipe -> ±X and ±Z.',
      axial: 'LINE STOP, LIMIT, LIM = axial ± unless explicit sign; axial gap = 10×GAP.',
      springWarning: 'Can Spring / Spring Can = warning coil below pipe.',
      visualResolver: 'Apply OD×2/3 only after engineering contact and only for final pipe-parallel/axial symbols.',
    },
  };
}

function supportRenderingSourceForBmCiiMode(mode) {
  const normalized = text(mode).toLowerCase();
  if (normalized === 'isonote-expected') return 'isonote';
  if (normalized === 'compare') return 'compare';
  return 'inputxml';
}

function bmCiiSceneOptions(summary) {
  if (!summary) return {};
  return {
    supportRendering: { source: supportRenderingSourceForBmCiiMode(summary.mode) },
    bmCiiSupportAnnotation: summary,
  };
}

export async function run(ctx = {}) {
  const stdout = [];
  const stderr = [];
  const file = (ctx.inputFiles || []).find((entry) => entry?.role === 'primary') || ctx.inputFiles?.[0];
  const sourceName = file?.name || 'input.xml';
  const options = ctx.options || {};
  const bmCiiSupportAnnotation = bmCiiSupportAnnotationSummary(options);
  let bmCiiEnrichmentStats = null;

  try {
    if (!file) throw new Error('Select a primary Input XML file first.');
    ctx.setStatus?.('Reading Input XML...', 'running');
    const xmlText = await readFileText(file);
    const extracted = extractInputXmlBranches(xmlText, {
      sourceId: 'inputxml-glb',
      fileName: sourceName,
    });
    if (!extracted.ok) throw new Error('Input XML could not be mapped to UXML geometry.');

    const bendMetadata = applyInputXmlBendMetadata(xmlText, extracted.doc);
    if (bendMetadata.bendTagCount) {
      stdout.push(`InputXML bend tags: ${bendMetadata.bendTagCount}; radius values: ${bendMetadata.radiusCount}; angle values: ${bendMetadata.angleCount}`);
    }

    const caesarSupportMetadata = applyInputXmlCaesarSupportMetadata(xmlText, extracted.doc, {
      sourceId: 'inputxml-glb',
    });
    if (caesarSupportMetadata.supportTagCount) {
      stdout.push(`InputXML CAESAR support/restraint tags: ${caesarSupportMetadata.supportTagCount}; expanded: ${caesarSupportMetadata.expandedSupportCount}`);
      stdout.push(`InputXML CAESAR support kinds: ${JSON.stringify(caesarSupportMetadata.kindCounts)}`);
    }
    if (bmCiiSupportAnnotation) {
      stdout.push(`BM_CII support/annotation tool active: ${JSON.stringify({ mode: bmCiiSupportAnnotation.mode, singleAxisZDecision: bmCiiSupportAnnotation.singleAxisZDecision })}`);
    }

    const { model, stats, diagnostics } = adaptUxmlToGlbModel(extracted.doc, options);
    if (bmCiiSupportAnnotation) {
      bmCiiEnrichmentStats = applyBmCiiSupportAnnotationEnrichment(model, xmlText, options);
      stdout.push(`BM_CII model enrichment: ${JSON.stringify(bmCiiEnrichmentStats)}`);
    }
    const nodeLabelStats = options.exportNodeLabels === false
      ? { nodeLabelCount: 0, skipped: true }
      : appendInputXmlGlbNodeLabels(model, extracted.doc, stats);
    const labelOptionStats = applyLabelExportOptions(model, options);
    const postEnrichmentModelStats = summarizeModelComponents(model);
    if (!model.components.length) throw new Error('No drawable Input XML components were found for GLB export.');

    stdout.push(`InputXML→GLB components: ${stats.componentCount}`);
    stdout.push(`Component types: ${JSON.stringify(stats.typeCounts)}`);
    if (bmCiiSupportAnnotation) {
      const preTypes = JSON.stringify(stats.typeCounts || {});
      const postTypes = JSON.stringify(postEnrichmentModelStats.typeCounts || {});
      if (postEnrichmentModelStats.componentCount !== stats.componentCount) {
        stdout.push(`InputXML→GLB components (post BM_CII enrichment): ${postEnrichmentModelStats.componentCount}`);
      }
      if (postTypes !== preTypes) {
        stdout.push(`Component types (post BM_CII enrichment): ${postTypes}`);
      }
    }
    if (nodeLabelStats.nodeLabelCount) {
      stdout.push(`Node labels added: ${nodeLabelStats.nodeLabelCount}`);
    } else if (nodeLabelStats.skipped) {
      stdout.push('Node labels skipped by exportNodeLabels=false.');
    }
    if (Object.values(labelOptionStats).some((count) => count > 0)) {
      stdout.push(`GLB label export options: ${JSON.stringify(labelOptionStats)}`);
    }
    if (stats.bendRadiusCount) {
      stdout.push(`Bend radius metadata applied: ${stats.bendRadiusCount}`);
    }
    if (stats.suppressedFullBendCurveCount) {
      stdout.push(`Suppressed oversized CAESAR bend curves: ${stats.suppressedFullBendCurveCount}`);
    }
    if (Object.keys(stats.supportKindCounts || {}).length) {
      stdout.push(`Support kinds: ${JSON.stringify(stats.supportKindCounts)}`);
    }
    if (bmCiiSupportAnnotation) {
      const preSupportKinds = JSON.stringify(stats.supportKindCounts || {});
      const postSupportKinds = JSON.stringify(postEnrichmentModelStats.supportKindCounts || {});
      if (postSupportKinds !== preSupportKinds) {
        stdout.push(`Support kinds (post BM_CII enrichment): ${postSupportKinds}`);
      }
    }

    ctx.setStatus?.('Building 3D GLB scene...', 'running');
    const sceneOptions = {
      ...bmCiiSceneOptions(bmCiiSupportAnnotation),
      glbVisualProfile: FORCED_GLB_VISUAL_PROFILE,
    };
    stdout.push(`GLB visual profile: ${FORCED_GLB_VISUAL_PROFILE} (rich profile disabled).`);
    const scene = buildExportScene(model, createSceneLog(stdout, stderr), sceneOptions);
    const glbBlob = await exportSceneToGLB(scene);
    const arrayBuffer = await blobLikeToArrayBuffer(glbBlob);
    const stem = baseName(sourceName);

    const outputs = [{
      name: `${stem}.glb`,
      base64: arrayBufferToBase64(arrayBuffer),
      mime: 'model/gltf-binary',
    }];

    if (options.includeSidecarJson !== false) {
      outputs.push({
        name: `${stem}-glb-sidecar.json`,
        text: JSON.stringify({
          schema: 'inputxml-glb-sidecar/v1',
          source: sourceName,
          branches: extracted.branches,
          exportOptions: {
            exportNodeLabels: options.exportNodeLabels !== false,
            exportRestraintText: options.exportRestraintText !== false && options.showSupportLabels !== false,
            exportComponentText: options.exportComponentText !== false && options.showComponentLabels !== false,
            glbVisualProfile: FORCED_GLB_VISUAL_PROFILE,
          },
          bmCiiSupportAnnotation,
          bmCiiEnrichmentStats,
          stats: {
            ...stats,
            postEnrichmentModelStats,
            bendMetadata,
            caesarSupportMetadata,
            nodeLabelStats,
            labelOptionStats,
            bmCiiEnrichmentStats,
          },
          diagnostics: [...(extracted.diagnostics || []), ...(diagnostics || [])],
        }, null, 2),
        mime: 'application/json',
      });
    }

    ctx.setStatus?.(`Completed: ${outputs[0].name}`, 'ok');
    return {
      ok: true,
      outputs,
      logs: { stdout, stderr },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.push(message);
    ctx.setStatus?.(`Failed: ${message}`, 'error');
    return {
      ok: false,
      outputs: [],
      logs: { stdout, stderr },
    };
  }
}
