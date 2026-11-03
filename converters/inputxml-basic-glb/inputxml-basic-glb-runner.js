function text(value) { return String(value ?? '').trim(); }
async function readFileText(file) {
  if (typeof file?.text === 'string') return file.text;
  if (file?.bytes instanceof Uint8Array) return new TextDecoder('utf-8').decode(file.bytes);
  if (file?.bytes instanceof ArrayBuffer) return new TextDecoder('utf-8').decode(new Uint8Array(file.bytes));
  if (typeof file?.file?.text === 'function') return file.file.text();
  if (typeof file?.text === 'function') return file.text();
  return '';
}
function baseName(name) { const normalized = text(name) || 'inputxml-glb-model'; return normalized.replace(/\.[^.]+$/, '') || 'inputxml-glb-model'; }
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer instanceof ArrayBuffer ? buffer : buffer.buffer ?? buffer);
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export async function run(ctx = {}) {
  const stdout = [], stderr = [];
  const file = (ctx.inputFiles || []).find((entry) => entry?.role === 'primary') || ctx.inputFiles?.[0];
  const sourceName = file?.name || 'input.xml';
  const options = { ...(ctx.options || {}) };
  try {
    if (!file) throw new Error('Select a primary Input XML file first.');
    ctx.setStatus?.('Reading InputXML for INPUTXML->GLB...', 'running');
    const xmlText = await readFileText(file);
    if (!xmlText.trim()) throw new Error('File is empty or could not be read.');
    const outputs = [];
    const stem = baseName(sourceName);
    ctx.setStatus?.('Building INPUTXML->GLB scene...', 'running');
    try {
      const { convertInputXmlToGlb, exportSceneToGlb } = await import('./InputXmlBasicSceneBuilder.js');
      const { applyInputXmlGlbPostFixes } = await import('./InputXmlBasicPostProcessor.js');
      const { applyInputXmlRestraintShapeFixes } = await import('./InputXmlBasicRestraintShapeFixes.js');
      const { buildInputXmlManagedStageJson } = await import('./InputXmlBasicStagedJsonBuilder.js');

      const result = await convertInputXmlToGlb(xmlText, options);
      const postProcess = applyInputXmlGlbPostFixes(result.scene, result.model, options);
      const restraintShapeFix = applyInputXmlRestraintShapeFixes(result.scene, result.model, options);

      result.audit.postProcess = postProcess;
      result.audit.restraintShapeFix = restraintShapeFix;
      result.glb = await exportSceneToGlb(result.scene);

      const glbBuffer = result.glb instanceof ArrayBuffer ? result.glb : await result.glb?.arrayBuffer?.() ?? result.glb;
      if (!glbBuffer) throw new Error('GLB exporter returned no binary data.');
      outputs.push({ name: `${stem}.glb`, base64: arrayBufferToBase64(glbBuffer), mime: 'model/gltf-binary' });

      if (options.includeManagedStageJson !== false) {
        const managedStage = buildInputXmlManagedStageJson(result.model, { sourceName });
        outputs.push({ name: `${stem}_managed_stage.json`, text: JSON.stringify(managedStage, null, 2), mime: 'application/json' });
        result.audit.managedStageJson = {
          schema: managedStage.schema,
          profile: managedStage.profile,
          outputName: `${stem}_managed_stage.json`,
          components: managedStage.stats.components,
          restraints: managedStage.stats.restraints,
          children: managedStage.stats.children,
        };
      }

      stdout.push(`Converted: components=${result.audit.componentCount}, nodes=${result.audit.nodeCount}, supportSymbols=${result.audit.supportSymbols.length}, isonoteRecords=${result.audit.isonoteRecords}, managedStage=${options.includeManagedStageJson === false ? 'disabled' : 'created'}, postRestraintMeshes=${postProcess.restraintMeshesScaled}, compactNodeLabels=${postProcess.nodeLabelsCreated}, anchorBlocks=${restraintShapeFix.anchorBlocksCreated}, unknownCrosses=${restraintShapeFix.unknownCrossesCreated}`);
      if (options.includeSidecarJson !== false) {
        outputs.push({ name: `${stem}-inputxml-glb-sidecar.json`, text: JSON.stringify({ schema: 'inputxml-glb-sidecar/v1', source: sourceName, converter: 'INPUTXML->GLB', ...result.audit }, null, 2), mime: 'application/json' });
      }
    } catch (glbError) {
      throw new Error(`INPUTXML->GLB export failed: ${glbError?.message || glbError}`);
    }
    if (!outputs.some((entry) => /\.glb$/i.test(entry?.name || ''))) throw new Error('INPUTXML->GLB produced no GLB output.');
    ctx.setStatus?.(`Completed: ${outputs[0]?.name || stem}`, 'ok');
    return { ok: true, outputs, logs: { stdout, stderr } };
  } catch (error) {
    const message = error?.message || String(error);
    stderr.push(message);
    ctx.setStatus?.(`Failed: ${message}`, 'bad');
    return { ok: false, outputs: [], logs: { stdout, stderr }, diagnostics: [{ severity: 'ERROR', message }] };
  }
}
