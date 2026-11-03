// Registry entry for the "InputXML -> RVM (+ GLB)" converter.
//
// The converter registry is loaded when the Model Converters tab opens. Keep the
// heavyweight InputXML runner behind a dynamic import so a transient failure in a
// runner leaf module cannot reject the whole tab import before this converter is
// actually run.

let inputXmlToRvmRunPromise = null;

async function loadInputXmlToRvmRun() {
  if (!inputXmlToRvmRunPromise) {
    inputXmlToRvmRunPromise = import('../../../converters/inputxml-rvm/inputxml-to-rvm-runner.js')
      .then((module) => {
        if (typeof module.run !== 'function') {
          throw new Error('InputXML runner module did not export run().');
        }
        return module.run;
      });
  }
  return inputXmlToRvmRunPromise;
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
    warn(code, payload = {}) { stdout.push(`WARN ${code}: ${JSON.stringify(payload)}`); },
    error(code, payload = {}) { stderr.push(`ERROR ${code}: ${JSON.stringify(payload)}`); },
  };
}

export async function run(ctx = {}) {
  const runInputXmlToRvm = await loadInputXmlToRvmRun();
  const result = await runInputXmlToRvm(ctx);
  const options = ctx.options || {};

  // Append a GLB companion for the in-browser viewer unless explicitly disabled.
  if (result.ok && options.includeGlb !== false && result.model && result.model.components?.length) {
    const stdout = result.logs?.stdout || (result.logs = { ...(result.logs || {}), stdout: [] }).stdout;
    const stderr = result.logs?.stderr || (result.logs.stderr = []);
    try {
      ctx.setStatus?.('Building GLB companion for the web viewer...', 'running');
      const [{ buildExportScene }, { exportSceneToGLB }] = await Promise.all([
        import('../../../js/pcf2glb/glb/buildExportScene.js'),
        import('../../../js/pcf2glb/glb/exportSceneToGLB.js'),
      ]);
      const scene = buildExportScene(result.model, createSceneLog(stdout, stderr), {
        glbVisualProfile: 'basic-only',
      });
      const glbBlob = await exportSceneToGLB(scene);
      const arrayBuffer = await blobLikeToArrayBuffer(glbBlob);
      result.outputs.push({
        name: `${result.stem}.glb`,
        base64: arrayBufferToBase64(arrayBuffer),
        mime: 'model/gltf-binary',
      });
      stdout.push(`GLB companion written: ${result.stem}.glb (${arrayBuffer.byteLength} bytes)`);
      ctx.setStatus?.(`Completed: ${result.outputs[0].name} (+ GLB)`, 'ok');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      stdout.push(`GLB companion skipped: ${message} (three.js exporter unavailable in this context; the RVM output is unaffected).`);
    }
  }

  return result;
}
