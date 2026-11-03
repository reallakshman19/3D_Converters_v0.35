/**
 * Dedicated browser worker for CAESAR II neutral-file v11 <-> v14 conversion.
 * Keeps the version adapter isolated from the shared InputXML/CII worker runtime.
 */
import { loadPyodide } from '../vendor/pyodide/pyodide.mjs';

const PYODIDE_INDEX_URL = new URL('../vendor/pyodide/', import.meta.url).href;
const SCRIPT_FILES = Object.freeze([
  'cii_v11_v14.py',
  'cii_v11_v14_format.py',
  'cii_v11_v14_records.py',
  'cii_v11_v14_sif.py',
  'cii_v11_v14_validate.py',
  'cii2019_section_rules.py',
]);
const SCRIPT_PATH = '/scripts/cii_v11_v14.py';
const WORK_ROOT = '/work/cii-v11-v14';

let runtimePromise = null;
let scriptPromise = null;

function asText(value) {
  return value === undefined || value === null ? '' : String(value);
}

function sanitizeFileName(name) {
  const value = asText(name).trim() || 'input.cii';
  return value.replace(/[\\/:*?"<>|]/g, '_');
}

function errorText(error) {
  return [error?.name, error?.message || error, error?.stack].filter(Boolean).map(String).join(' | ');
}

async function getRuntime() {
  if (!runtimePromise) runtimePromise = loadPyodide({ indexURL: PYODIDE_INDEX_URL });
  return runtimePromise;
}

async function ensureScript(pyodide) {
  if (!scriptPromise) {
    scriptPromise = (async () => {
      pyodide.FS.mkdirTree('/scripts');
      for (const fileName of SCRIPT_FILES) {
        const scriptUrl = new URL(`./scripts/${fileName}`, import.meta.url).href;
        const response = await fetch(scriptUrl, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Failed to load ${fileName}: HTTP ${response.status} ${response.statusText || ''}`.trim());
        }
        const text = await response.text();
        if (!text.trim()) throw new Error(`${fileName} loaded as empty text.`);
        pyodide.FS.writeFile(`/scripts/${fileName}`, text, { encoding: 'utf8' });
      }
      pyodide.runPython('import sys; sys.path.insert(0, "/scripts") if "/scripts" not in sys.path else None');
    })().catch((error) => {
      scriptPromise = null;
      throw error;
    });
  }
  await scriptPromise;
}

async function runPython(pyodide, argv) {
  pyodide.globals.set('cii_job_argv', argv);
  const raw = await pyodide.runPythonAsync(`
import contextlib
import io
import json
import runpy
import sys
import traceback

_stdout = io.StringIO()
_stderr = io.StringIO()
_exit_code = 0
sys.argv = list(cii_job_argv)
with contextlib.redirect_stdout(_stdout), contextlib.redirect_stderr(_stderr):
    try:
        runpy.run_path(sys.argv[0], run_name="__main__")
    except SystemExit as exc:
        code = exc.code
        if code is None:
            _exit_code = 0
        elif isinstance(code, int):
            _exit_code = code
        else:
            print(code, file=sys.stderr)
            _exit_code = 1
    except Exception:
        traceback.print_exc()
        _exit_code = 1
json.dumps({"exit_code": _exit_code, "stdout": _stdout.getvalue(), "stderr": _stderr.getvalue()})
`);
  return JSON.parse(String(raw));
}

async function runJob(message) {
  const pyodide = await getRuntime();
  await ensureScript(pyodide);

  const jobId = sanitizeFileName(message.jobId || `job-${Date.now()}`);
  const jobDir = `${WORK_ROOT}/${jobId}`;
  pyodide.FS.mkdirTree(jobDir);

  const inputName = sanitizeFileName(message.inputName);
  const inputPath = `${jobDir}/${inputName}`;
  const outputPath = `${jobDir}/converted.cii`;
  const auditPath = `${jobDir}/conversion.audit.json`;
  const inputBytes = new Uint8Array(message.inputBytes || new ArrayBuffer(0));
  if (!inputBytes.byteLength) throw new Error('Primary CII input is empty.');
  pyodide.FS.writeFile(inputPath, inputBytes);

  const targetVersion = ['11', '14'].includes(String(message.targetVersion))
    ? String(message.targetVersion)
    : 'auto';
  const argv = [SCRIPT_PATH, inputPath, outputPath, '--target', targetVersion, '--audit-json', auditPath];
  if (message.allowLossy === true) argv.push('--allow-lossy');

  try {
    const execution = await runPython(pyodide, argv);
    if (Number(execution.exit_code) !== 0) {
      const detail = asText(execution.stderr).trim() || asText(execution.stdout).trim() || `exit code ${execution.exit_code}`;
      throw new Error(detail);
    }
    const outputBytes = pyodide.FS.readFile(outputPath);
    const auditText = pyodide.FS.readFile(auditPath, { encoding: 'utf8' });
    const audit = JSON.parse(auditText);
    return {
      outputBytes,
      auditText,
      audit,
      stdout: asText(execution.stdout).split(/\r?\n/).filter(Boolean),
      stderr: asText(execution.stderr).split(/\r?\n/).filter(Boolean),
      argv: argv.slice(1),
    };
  } finally {
    try { pyodide.FS.rmdir(jobDir); } catch {}
  }
}

self.addEventListener('message', async (event) => {
  const message = event.data || {};
  if (message.type !== 'run') return;
  try {
    const result = await runJob(message);
    self.postMessage({ type: 'result', jobId: message.jobId, ok: true, ...result });
  } catch (error) {
    self.postMessage({ type: 'result', jobId: message.jobId, ok: false, error: errorText(error) });
  }
});
