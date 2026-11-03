import { getConverterById } from './converter-registry.js?v=20260617-basic-glb-2';
import { run as runBaseRvmAttrToXml } from './converters/rvmattr-to-xml.js';
import { buildUxmlTextFromStagedHierarchy } from './converters/rvmattr-stagedjson-to-uxml.js?v=20260618-port-bore-contract-1';

function clean(value) {
  return String(value ?? '').trim();
}

function outputStemFromManagedStageName(name = 'RMSS_ATTRIBUTE_managed_stage.json') {
  const text = clean(name) || 'RMSS_ATTRIBUTE_managed_stage.json';
  return text
    .replace(/_managed_stage\.json$/i, '')
    .replace(/\.json$/i, '')
    || 'RMSS_ATTRIBUTE';
}

function looksLikeManagedStageHierarchy(value) {
  if (!Array.isArray(value)) return false;
  return value.some((entry) => {
    const type = clean(entry?.type || entry?.attributes?.TYPE).toUpperCase();
    return (type === 'BRAN' || type === 'BRANCH') && Array.isArray(entry?.children);
  });
}

export function appendUxmlSidecarToRvmAttrResult(result = {}, context = {}) {
  const outputs = Array.isArray(result.outputs) ? [...result.outputs] : [];
  if (outputs.some((output) => /_managed_stage\.uxml\.json$/i.test(output?.name || ''))) {
    return { ...result, outputs };
  }

  const stageOutput = outputs.find((output) => /_managed_stage\.json$/i.test(output?.name || '') && typeof output?.text === 'string');
  if (!stageOutput) return { ...result, outputs };

  let hierarchy = null;
  try {
    hierarchy = JSON.parse(stageOutput.text);
  } catch {
    return { ...result, outputs };
  }
  if (!looksLikeManagedStageHierarchy(hierarchy)) return { ...result, outputs };

  const stem = outputStemFromManagedStageName(stageOutput.name);
  const uxmlText = buildUxmlTextFromStagedHierarchy(hierarchy, {
    inputName: stageOutput.name,
    stem,
    projectId: context?.options?.projectId || context?.options?.projectIdentifier || '',
  });

  outputs.push({
    name: `${stem}_managed_stage.uxml.json`,
    text: uxmlText,
    mime: 'application/json;charset=utf-8',
  });

  const logs = {
    ...(result.logs || {}),
    stdout: [
      ...((Array.isArray(result.logs?.stdout) ? result.logs.stdout : [])),
      `Generated UXML sidecar ${stem}_managed_stage.uxml.json from managed_stage.json.`,
    ],
    stderr: Array.isArray(result.logs?.stderr) ? result.logs.stderr : [],
  };

  return { ...result, outputs, logs };
}

export async function runRvmAttrToXmlWithUxml(context = {}) {
  const result = await runBaseRvmAttrToXml(context);
  return appendUxmlSidecarToRvmAttrResult(result, context);
}

export function installRvmAttrUxmlAddon() {
  const converter = getConverterById('rvmattr_to_xml');
  if (!converter || converter.__rvmAttrUxmlAddonInstalled) return;
  const baseRun = converter.run || runBaseRvmAttrToXml;
  converter.run = async (context = {}) => appendUxmlSidecarToRvmAttrResult(await baseRun(context), context);
  converter.__rvmAttrUxmlAddonInstalled = true;
}
