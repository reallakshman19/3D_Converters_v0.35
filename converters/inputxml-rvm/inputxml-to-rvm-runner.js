// inputxml-to-rvm-runner.js
//
// SELF-CONTAINED "Input XML -> AVEVA RVM" converter.
//
// Per the task brief this converter must NOT depend on any shared viewer module
// (the shared Universal-XML / GLB pipeline is repeatedly patched by other
// workflows and has caused regressions). Every piece of logic it needs has been
// COPIED into this folder and PREFIXED with `Rvmx`, so this runner imports only
// from its own vendored siblings:
//
//   RvmxInputXmlBranchExtractor.js      (Input XML -> UXML document)
//   RvmxInputXmlBendMetadata.js         (bend radius/angle enrichment)
//   RvmxInputXmlCaesarSupportMetadata.js(CAESAR support/restraint expansion)
//   RvmxUxmlToGlbModelAdapter.js        (UXML -> parametric component model)
//   RvmxComponentModelToRvm.js          (component model -> binary RVM + .att)
//
// Pipeline: Input XML -> UXML -> parametric component model -> binary RVM.
// The RVM is built from the PARAMETRIC component model (exact primitives), never
// from tessellated geometry, so output stays exact and compact. Units: mm.

import { extractInputXmlBranches } from './RvmxInputXmlBranchExtractor.js';
import { applyInputXmlBendMetadata } from './RvmxInputXmlBendMetadata.js';
import { applyInputXmlCaesarSupportMetadata } from './RvmxInputXmlCaesarSupportMetadata.js';
import { adaptUxmlToGlbModel } from './RvmxUxmlToGlbModelAdapter.js';
import { componentModelToRvm } from './RvmxComponentModelToRvm.js';

function rvmxText(value) {
  return String(value ?? '').trim();
}

async function rvmxReadFileText(file) {
  if (typeof file?.text === 'string') return file.text;
  if (file?.bytes instanceof Uint8Array) return new TextDecoder('utf-8').decode(file.bytes);
  if (file?.bytes instanceof ArrayBuffer) return new TextDecoder('utf-8').decode(new Uint8Array(file.bytes));
  if (typeof file?.file?.text === 'function') return file.file.text();
  if (typeof file?.text === 'function') return file.text();
  return '';
}

function rvmxBaseName(name) {
  const normalized = rvmxText(name) || 'inputxml-model';
  return normalized.replace(/\.[^.]+$/, '') || 'inputxml-model';
}

function rvmxBytesToBase64(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (typeof Buffer !== 'undefined') return Buffer.from(view).toString('base64');
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < view.length; i += chunk) {
    binary += String.fromCharCode(...view.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function run(ctx = {}) {
  const stdout = [];
  const stderr = [];
  const file = (ctx.inputFiles || []).find((entry) => entry?.role === 'primary') || ctx.inputFiles?.[0];
  const sourceName = file?.name || 'input.xml';
  const options = ctx.options || {};

  try {
    if (!file) throw new Error('Select a primary Input XML file first.');
    ctx.setStatus?.('Reading Input XML...', 'running');
    const xmlText = await rvmxReadFileText(file);

    const extracted = extractInputXmlBranches(xmlText, {
      sourceId: 'inputxml-rvm',
      fileName: sourceName,
    });
    if (!extracted.ok) throw new Error('Input XML could not be mapped to UXML geometry.');

    const bendMetadata = applyInputXmlBendMetadata(xmlText, extracted.doc);
    if (bendMetadata.bendTagCount) {
      stdout.push(`InputXML bend tags: ${bendMetadata.bendTagCount}; radius values: ${bendMetadata.radiusCount}; angle values: ${bendMetadata.angleCount}`);
    }

    const caesarSupportMetadata = applyInputXmlCaesarSupportMetadata(xmlText, extracted.doc, {
      sourceId: 'inputxml-rvm',
    });
    if (caesarSupportMetadata.supportTagCount) {
      stdout.push(`InputXML CAESAR support/restraint tags: ${caesarSupportMetadata.supportTagCount}; expanded: ${caesarSupportMetadata.expandedSupportCount}`);
    }

    ctx.setStatus?.('Building parametric component model...', 'running');
    const { model, stats, diagnostics } = adaptUxmlToGlbModel(extracted.doc, options);
    if (!model.components.length) throw new Error('No drawable Input XML components were found for RVM export.');

    stdout.push(`InputXML->RVM components: ${stats.componentCount}`);
    stdout.push(`Component types: ${JSON.stringify(stats.typeCounts)}`);
    if (stats.bendRadiusCount) stdout.push(`Bend radius metadata applied: ${stats.bendRadiusCount}`);
    if (Object.keys(stats.supportKindCounts || {}).length) {
      stdout.push(`Support kinds: ${JSON.stringify(stats.supportKindCounts)}`);
    }

    const stem = rvmxBaseName(sourceName);

    ctx.setStatus?.('Serialising AVEVA RVM...', 'running');
    const precision = Number.isFinite(Number(options.rvmPrecision)) ? Number(options.rvmPrecision) : 3;
    const { rvm, att, primitiveCount } = componentModelToRvm(model, {
      precision,
      modelName: stem,
    });
    stdout.push(`RVM primitives written: ${primitiveCount}; bytes: ${rvm.length}`);

    // rvm is a Uint8Array (BINARY, big-endian). Emit as base64 like the GLB path.
    const outputs = [{
      name: `${stem}.rvm`,
      base64: rvmxBytesToBase64(rvm),
      mime: 'application/octet-stream',
    }];

    if (options.includeAtt !== false) {
      outputs.push({ name: `${stem}.att`, text: att, mime: 'text/plain' });
    }

    if (options.includeSidecarJson) {
      outputs.push({
        name: `${stem}-rvm-sidecar.json`,
        text: JSON.stringify({
          schema: 'inputxml-rvm-sidecar/v1',
          source: sourceName,
          branches: extracted.branches,
          exportOptions: { precision, includeAtt: options.includeAtt !== false },
          stats: { ...stats, primitiveCount, bendMetadata, caesarSupportMetadata },
          diagnostics: [...(extracted.diagnostics || []), ...(diagnostics || [])],
        }, null, 2),
        mime: 'application/json',
      });
    }

    ctx.setStatus?.(`Completed: ${outputs[0].name}`, 'ok');
    // `model` and `stem` are returned so an outer orchestrator can build an
    // optional GLB companion (for the in-browser viewer) WITHOUT this
    // self-contained runner having to import the shared three.js exporter.
    return { ok: true, outputs, logs: { stdout, stderr }, model, stem };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.push(message);
    ctx.setStatus?.(`Failed: ${message}`, 'error');
    return { ok: false, outputs: [], logs: { stdout, stderr } };
  }
}
