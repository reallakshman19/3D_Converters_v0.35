const CONVERTER_ID = 'xml_to_cii';

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function safeName(value) {
  return text(value || 'input.xml').replace(/[\\/:*?"<>|]/g, '_');
}

function stem(value) {
  const name = safeName(value);
  const index = name.lastIndexOf('.');
  return index > 0 ? name.slice(0, index) : name;
}

function boolOrNull(value) {
  if (value === true || value === false) return value;
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return value !== 0;
  const normalized = text(value).toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return null;
}

function jsonObject(value) {
  try {
    const parsed = JSON.parse(text(value) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function resolveSidecarSplitOption(options = {}) {
  const supportConfig = jsonObject(options.supportConfigJson);
  return boolOrNull(options.splitCondensedValveFlange)
    ?? boolOrNull(options.split_condensed_valve_flange)
    ?? boolOrNull(supportConfig.splitCondensedValveFlange)
    ?? boolOrNull(supportConfig.split_condensed_valve_flange);
}

function addSharedOptions(argv, options, secondaryPath) {
  const supportConfig = text(options.supportConfigJson);
  if (supportConfig) argv.push('--support-config-json', supportConfig);
  if (secondaryPath) argv.push('--staged-json', secondaryPath);
  argv.push(options.useRestraintTypeBasedOnJson === false
    ? '--no-use-restraint-type-based-on-json'
    : '--use-restraint-type-based-on-json');
  if (options.kgToNewton !== false) argv.push('--weight-scale', '10');
}

function addTopologyOptions(argv, options) {
  const split = resolveSidecarSplitOption(options);
  if (split === true) argv.push('--split-condensed-valve-flange');
  if (split === false) argv.push('--no-split-condensed-valve-flange');
  const coordsMode = text(options.coordsMode).toLowerCase();
  argv.push('--coords-mode', ['all', 'none'].includes(coordsMode) ? coordsMode : 'first');
  const tolerance = Number(options.sidecarParityTolerance);
  argv.push('--parity-tolerance', String(Number.isFinite(tolerance) ? tolerance : 0.001));
}

export function buildXmlCiiSidecarExportSpec(input) {
  if (input.converterId !== CONVERTER_ID) return null;
  const sourceStem = stem(input.primaryName);
  const outputName = `${sourceStem}_xml_to_cii2019_enriched.input.xml`;
  const diagnosticsName = `${sourceStem}_xml_to_cii2019_inputxml_sidecar_diagnostics.json`;
  const outputPath = `${input.jobDir}/${outputName}`;
  const diagnosticsPath = `${input.jobDir}/${diagnosticsName}`;
  const argv = [
    '/scripts/xml_to_inputxml_debug.py',
    '--input', input.primaryPath,
    '--output', outputPath,
    '--cii-output', input.ciiOutputPath,
    '--diagnostics-output', diagnosticsPath,
  ];
  addSharedOptions(argv, input.options || {}, input.secondaryPath);
  addTopologyOptions(argv, input.options || {});
  return { outputName, outputPath, diagnosticsName, diagnosticsPath, argv };
}

export function readXmlCiiSidecarArtifacts(pyodide, result) {
  if (!result) return null;
  const inputXmlText = pyodide.FS.readFile(result.outputPath, { encoding: 'utf8' });
  const diagnosticsText = pyodide.FS.readFile(result.diagnosticsPath, { encoding: 'utf8' });
  return {
    inputXml: { name: result.outputName, text: inputXmlText, mime: 'application/xml;charset=utf-8' },
    diagnostics: {
      name: result.diagnosticsName,
      text: diagnosticsText,
      mime: 'application/json;charset=utf-8',
      document: JSON.parse(diagnosticsText),
    },
  };
}
