import { loadPyodide } from 'https://cdn.jsdelivr.net/pyodide/v0.27.2/full/pyodide.mjs';
import {
  buildConverterWorkerResponse,
  validateConverterWorkerRequest,
} from './worker-contract.js';
import { buildInvocation } from './invocation-builder.js';

const PYODIDE_INDEX_URL = 'https://cdn.jsdelivr.net/pyodide/v0.27.2/full/';

const SCRIPT_FILE_NAMES = Object.freeze([
  'rvm_to_rev.py',
  'rev_to_pcf.py',
  'rev_to_xml.py',
  'json_to_xml.py',
  'stagedjson_to_xml.py',
  'stagedjson_to_inputxml.py',
  'psi116_upstream_common.py',
  'psi116_contract_check.py',
  'inputxml_bookmark.py',
  'rev_to_stp.py',
  'xml_to_cii2019.py',
  'cii_syntax_check_2019.py',
  'inputxml_to_cii2014.py',
  'inputxml_to_cii2019.py',
  'cii2019_miscel_hardener.py',
  'cii2019_displmnt_sync.py',
  'inputxml_profile_sys30_b7410250_benchmark.cii',
  'inputxml_profile_bm_cii_2019.cii',
  'pdf_to_inputxml.py',
  'pdf_to_inputxml_cii14.py',
  'pdf_to_inputxml_profiles.json',
  'pdf_inputxml_profile_bm_cii.xml',
  'rvm_attribute_to_xml.py',
  'rvm_attribute_to_xml_to_cii.py',
]);

const XML_CONTRACT_GATED_CONVERTERS = Object.freeze(new Set([
  'stagedjson_to_xml',
  'rvmattr_to_xml',
]));

const RUN_SNIPPET = `
import runpy
import sys
import traceback

exit_code = 0
sys.argv = list(job_argv)
try:
    runpy.run_path(job_script_path, run_name="__main__")
except SystemExit as exc:
    code = exc.code
    if code is None:
        exit_code = 0
    elif isinstance(code, int):
        exit_code = code
    else:
        print(code, file=sys.stderr)
        exit_code = 1
except Exception:
    traceback.print_exc()
    exit_code = 1

exit_code
`;

let _pyodidePromise = null;
let _scriptsLoaded = false;

function _toString(value) {
  if (value === undefined || value === null) return '';
  return String(value);
}

function _sanitizeFileName(name) {
  const normalized = _toString(name).trim();
  if (!normalized) return 'input.dat';
  return normalized.replace(/[\\/:*?"<>|]/g, '_');
}

function _decodeLogBatches(values) {
  return values
    .map((line) => _toString(line))
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
}

function _extractFailureDetail(stderrLines) {
  if (!stderrLines.length) return '';
  const priorityPatterns = [/^usage:/i, /^error:/i, /^RuntimeError:/i, /^ValueError:/i, /^Exception:/i, /contract check failed/i];
  for (let i = stderrLines.length - 1; i >= 0; i -= 1) {
    const line = String(stderrLines[i] || '').trim();
    if (!line) continue;
    for (const pattern of priorityPatterns) if (pattern.test(line)) return line;
  }
  return String(stderrLines[stderrLines.length - 1] || '').trim();
}

function _inferTextMime(fileName) {
  const normalized = _toString(fileName).toLowerCase();
  if (normalized.endsWith('.json')) return 'application/json;charset=utf-8';
  return 'text/plain;charset=utf-8';
}

async function _getPyodide() {
  if (!_pyodidePromise) _pyodidePromise = loadPyodide({ indexURL: PYODIDE_INDEX_URL });
  return _pyodidePromise;
}

async function _ensureScripts(pyodide) {
  if (_scriptsLoaded) return;
  pyodide.FS.mkdirTree('/scripts');
  pyodide.FS.mkdirTree('/work');
  for (const fileName of SCRIPT_FILE_NAMES) {
    const url = new URL(`./scripts/${fileName}`, import.meta.url);
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Failed to load converter script ${fileName}: HTTP ${response.status}`);
    const text = await response.text();
    pyodide.FS.writeFile(`/scripts/${fileName}`, text, { encoding: 'utf8' });
  }
  pyodide.runPython(`
import sys
if "/scripts" not in sys.path:
    sys.path.insert(0, "/scripts")
`);
  _scriptsLoaded = true;
}

function _writeInputFile(pyodide, jobDir, fileSpec) {
  const fileName = _sanitizeFileName(fileSpec?.name);
  const path = `${jobDir}/${fileName}`;
  const bytes = new Uint8Array(fileSpec?.bytes || new ArrayBuffer(0));
  pyodide.FS.writeFile(path, bytes);
  return path;
}

async function _runPythonScript(pyodide, scriptPath, argv, stdout, stderr) {
  pyodide.globals.set('job_script_path', scriptPath);
  pyodide.globals.set('job_argv', argv);
  const exitCode = await pyodide.runPythonAsync(RUN_SNIPPET);
  if (Number(exitCode) !== 0) {
    const stdoutLines = _decodeLogBatches(stdout);
    const stderrLines = _decodeLogBatches(stderr);
    const detail = _extractFailureDetail(stderrLines);
    throw new Error(detail ? `Converter exited with code ${exitCode}: ${detail}` : `Converter exited with code ${exitCode}. Logs: ${stdoutLines.slice(-5).join(' | ')}`);
  }
}

function _contractSourceKind(converterId) {
  if (converterId === 'stagedjson_to_xml') return 'stagedjson';
  if (converterId === 'rvmattr_to_xml') return 'attribute';
  return 'auto';
}

async function _runInputXml2019CiiHardener(pyodide, converterId, sourcePath, outputPath, stdout, stderr) {
  if (converterId !== 'inputxml_to_cii2019') return null;

  const argv = [
    '/scripts/cii2019_miscel_hardener.py',
    '--input',
    outputPath,
    '--output',
    outputPath,
    '--input-xml',
    sourcePath,
    '--strict',
  ];

  await _runPythonScript(
    pyodide,
    '/scripts/cii2019_miscel_hardener.py',
    argv,
    stdout,
    stderr,
  );

  return {
    script: 'cii2019_miscel_hardener.py',
    outputPath,
  };
}

async function _runInputXml2019DisplmntSync(pyodide, converterId, sourcePath, outputPath, stdout, stderr) {
  if (converterId !== 'inputxml_to_cii2019') return null;

  const argv = [
    '/scripts/cii2019_displmnt_sync.py',
    '--input',
    outputPath,
    '--output',
    outputPath,
    '--input-xml',
    sourcePath,
    '--strict',
  ];

  await _runPythonScript(
    pyodide,
    '/scripts/cii2019_displmnt_sync.py',
    argv,
    stdout,
    stderr,
  );

  return {
    script: 'cii2019_displmnt_sync.py',
    outputPath,
  };
}

async function _runContractGate(pyodide, converterId, sourcePath, outputPath, jobDir, stdout, stderr) {
  if (!XML_CONTRACT_GATED_CONVERTERS.has(converterId)) return null;
  const reportPath = `${jobDir}/${_sanitizeFileName(converterId)}_psi116_contract_report.json`;
  const argv = [
    '/scripts/psi116_contract_check.py',
    '--xml', outputPath,
    '--source-input', sourcePath,
    '--source-kind', _contractSourceKind(converterId),
    '--report', reportPath,
    '--strict',
  ];
  await _runPythonScript(pyodide, '/scripts/psi116_contract_check.py', argv, stdout, stderr);
  try {
    return pyodide.FS.readFile(reportPath, { encoding: 'utf8' });
  } catch {
    return null;
  }
}

async function _runJob(message) {
  const converterId = _toString(message?.converterId);
  if (!converterId) throw new Error('Missing converterId.');

  const primary = (message?.inputFiles || []).find((f) => f?.role === 'primary');
  if (!primary) throw new Error('Primary input file is required.');

  const secondary = (message?.inputFiles || []).find((f) => f?.role === 'secondary');
  const options = message?.options || {};
  const pyodide = await _getPyodide();
  await _ensureScripts(pyodide);

  const stdout = [];
  const stderr = [];
  pyodide.setStdout({ batched: (text) => stdout.push(text) });
  pyodide.setStderr({ batched: (text) => stderr.push(text) });

  const jobDir = `/work/job_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
  pyodide.FS.mkdirTree(jobDir);

  const primaryPath = _writeInputFile(pyodide, jobDir, primary);
  const secondaryPath = secondary ? _writeInputFile(pyodide, jobDir, secondary) : null;
  const invocation = buildInvocation(converterId, primaryPath, primary.name, secondaryPath, options, jobDir);

  await _runPythonScript(pyodide, invocation.scriptPath, invocation.argv, stdout, stderr);

  const sourcePathForHardener =
    invocation.argv[invocation.argv.indexOf('--input') + 1] || primaryPath;

  const hardenerResult = await _runInputXml2019CiiHardener(
    pyodide,
    converterId,
    sourcePathForHardener,
    invocation.outputPath,
    stdout,
    stderr,
  );

  const displmntSyncResult = await _runInputXml2019DisplmntSync(
    pyodide,
    converterId,
    sourcePathForHardener,
    invocation.outputPath,
    stdout,
    stderr,
  );

  const contractReportText = await _runContractGate(
    pyodide,
    converterId,
    invocation.argv[invocation.argv.indexOf('--input') + 1] || primaryPath,
    invocation.outputPath,
    jobDir,
    stdout,
    stderr,
  );

  const stdoutLines = _decodeLogBatches(stdout);
  const stderrLines = _decodeLogBatches(stderr);
  const outputText = pyodide.FS.readFile(invocation.outputPath, { encoding: 'utf8' });
  const outputs = [
    { name: invocation.outputName, text: outputText, mime: _inferTextMime(invocation.outputName) },
  ];
  if (contractReportText) {
    outputs.push({
      name: invocation.outputName.replace(/\.[^.]+$/, '_psi116_contract_report.json'),
      text: contractReportText,
      mime: 'application/json;charset=utf-8',
    });
  }
  return {
    output: outputs,
    logs: {
      stdout: stdoutLines,
      stderr: stderrLines,
      argv: invocation.argv.slice(1),
      postprocess: [hardenerResult, displmntSyncResult].filter(Boolean),
    },
  };
}

self.addEventListener('message', async (event) => {
  const message = event.data || {};
  if (message.type !== 'run') return;
  const jobId = message.jobId;
  const validation = validateConverterWorkerRequest(message);
  if (!validation.ok) {
    self.postMessage(buildConverterWorkerResponse(jobId, false, null, null, validation.error));
    return;
  }
  try {
    const result = await _runJob(message);
    self.postMessage(buildConverterWorkerResponse(jobId, true, result.output, result.logs, null));
  } catch (error) {
    self.postMessage(buildConverterWorkerResponse(jobId, false, null, null, _toString(error?.message || error)));
  }
});
