import { loadPyodide } from '../../vendor/pyodide/pyodide.mjs';
import { downloadOutput } from './core/output-utils.js';

const ADDON_VERSION = '20260816-cii-ver11-merge-1';
const PYODIDE_INDEX_URL = new URL('../../vendor/pyodide/', import.meta.url).href;
const MERGE_SCRIPT_URL = new URL('../../converters/scripts/cii2019_multi_merge.py', import.meta.url).href;
const RULES_SCRIPT_URL = new URL('../../converters/scripts/cii2019_section_rules.py', import.meta.url).href;
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

let pyodidePromise = null;
let scriptsLoaded = false;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[ch]);
}

function safeFileName(name) {
  const cleaned = String(name || 'input.CII').replace(/[\\/:*?"<>|]/g, '_').trim();
  return cleaned || 'input.CII';
}

function baseName(name) {
  const clean = safeFileName(name);
  const index = clean.lastIndexOf('.');
  return index > 0 ? clean.slice(0, index) : clean;
}

async function fetchText(url, label) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Failed to load ${label}: HTTP ${response.status}`);
  const text = await response.text();
  if (!text.trim()) throw new Error(`${label} loaded as empty text.`);
  return text;
}

async function ensurePythonRuntime() {
  if (!pyodidePromise) pyodidePromise = loadPyodide({ indexURL: PYODIDE_INDEX_URL });
  const pyodide = await pyodidePromise;
  if (!scriptsLoaded) {
    const [mergeScript, rulesScript] = await Promise.all([
      fetchText(MERGE_SCRIPT_URL, 'cii2019_multi_merge.py'),
      fetchText(RULES_SCRIPT_URL, 'cii2019_section_rules.py'),
    ]);
    pyodide.FS.mkdirTree('/scripts');
    pyodide.FS.mkdirTree('/work');
    pyodide.FS.writeFile('/scripts/cii2019_multi_merge.py', mergeScript, { encoding: 'utf8' });
    pyodide.FS.writeFile('/scripts/cii2019_section_rules.py', rulesScript, { encoding: 'utf8' });
    pyodide.runPython(`
import sys
if "/scripts" not in sys.path:
    sys.path.insert(0, "/scripts")
`);
    scriptsLoaded = true;
  }
  return pyodide;
}

function normalizeOffset(value, index) {
  const text = String(value ?? '').trim();
  if (!/^-?\d+$/.test(text)) throw new Error(`File ${index + 1}: node offset must be an integer.`);
  const offset = Number(text);
  if (!Number.isSafeInteger(offset)) throw new Error(`File ${index + 1}: node offset is outside the safe integer range.`);
  return offset;
}

function modalMarkup() {
  return `
    <div data-cii-v11-card style="width:min(980px,96vw);max-height:90vh;overflow:hidden;display:flex;flex-direction:column;background:#111923;color:#e7edf5;border:1px solid #33465e;border-radius:12px;box-shadow:0 24px 80px rgba(0,0,0,.55);">
      <div style="padding:16px 18px;border-bottom:1px solid #2d3c50;display:flex;justify-content:space-between;gap:18px;align-items:flex-start;">
        <div>
          <div style="font-size:19px;font-weight:750;">CII Ver 11 Merge</div>
          <div style="margin-top:5px;color:#9fb1c6;font-size:12px;line-height:1.45;max-width:760px;">Merge two or more CAESAR II Ver 11 / CII 2019 neutral files into one CII. Node offsets are applied to every qualified node-bearing section and element auxiliary pointers are rebased.</div>
        </div>
        <button type="button" data-cii-v11-close class="model-converters-download-btn" aria-label="Close">Close</button>
      </div>
      <div style="padding:14px 18px;overflow:auto;">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <label class="model-converters-run-btn" style="display:inline-flex;align-items:center;cursor:pointer;">
            Add CII files
            <input data-cii-v11-files type="file" accept=".cii,.CII" multiple hidden>
          </label>
          <button type="button" data-cii-v11-clear class="model-converters-download-btn">Clear</button>
          <span style="font-size:12px;color:#8fa2b8;">Files are merged in the order shown below.</span>
        </div>

        <div data-cii-v11-empty style="margin-top:14px;padding:18px;border:1px dashed #41536a;border-radius:8px;color:#8fa2b8;text-align:center;">Add at least two .CII files.</div>
        <div data-cii-v11-table-wrap style="display:none;margin-top:14px;overflow:auto;border:1px solid #2e4056;border-radius:8px;">
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead><tr style="background:#172435;color:#a9c3e2;text-align:left;"><th style="padding:9px 10px;">#</th><th style="padding:9px 10px;">CII file</th><th style="padding:9px 10px;width:190px;">Node offset</th><th style="padding:9px 10px;width:84px;"></th></tr></thead>
            <tbody data-cii-v11-rows></tbody>
          </table>
        </div>

        <div style="display:grid;grid-template-columns:minmax(260px,1fr) minmax(260px,1fr);gap:12px;margin-top:14px;">
          <label style="display:block;color:#a9c3e2;font-size:12px;">Output filename
            <input data-cii-v11-output-name value="Merged_Ver11.CII" style="display:block;width:100%;box-sizing:border-box;margin-top:6px;background:#0c141e;color:#e7edf5;border:1px solid #3a4d64;border-radius:6px;padding:8px 9px;">
          </label>
          <label style="display:flex;align-items:center;gap:8px;padding-top:23px;color:#c5d2df;font-size:12px;">
            <input data-cii-v11-overlap type="checkbox">
            Allow intentional shared-node overlap only when coordinates agree
          </label>
        </div>

        <div style="margin-top:12px;padding:10px 12px;border-left:3px solid #6b89ad;background:#121f2d;color:#9fb1c6;font-size:12px;line-height:1.45;">
          Default is fail-closed: incompatible versions/units/global options, accidental node collisions, or unqualified node-bearing sections stop the merge. Example: offset <code>5000</code> maps File 2 node <code>10 → 5010</code>, <code>20 → 5020</code>, <code>30 → 5030</code>.
        </div>

        <div style="display:flex;gap:10px;align-items:center;margin-top:16px;flex-wrap:wrap;">
          <button type="button" data-cii-v11-run class="model-converters-run-btn">Merge CII files</button>
          <button type="button" data-cii-v11-download disabled class="model-converters-download-btn">Download merged CII</button>
          <button type="button" data-cii-v11-report disabled class="model-converters-download-btn">Download merge receipt</button>
          <span data-cii-v11-status style="font-size:12px;color:#9fb1c6;"></span>
        </div>
        <pre data-cii-v11-log style="display:none;margin:12px 0 0;max-height:190px;overflow:auto;white-space:pre-wrap;background:#09111a;border:1px solid #26384d;border-radius:7px;padding:10px;color:#b9c7d7;font:11px/1.45 Consolas,monospace;"></pre>
      </div>
    </div>
  `;
}

function openMergeModal() {
  const state = {
    entries: [],
    mergedText: '',
    reportText: '',
    outputName: 'Merged_Ver11.CII',
  };
  const overlay = document.createElement('div');
  overlay.dataset.ciiV11MergeModal = ADDON_VERSION;
  overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.66);display:flex;align-items:center;justify-content:center;padding:20px;';
  overlay.innerHTML = modalMarkup();
  document.body.appendChild(overlay);

  const filesInput = overlay.querySelector('[data-cii-v11-files]');
  const rowsEl = overlay.querySelector('[data-cii-v11-rows]');
  const emptyEl = overlay.querySelector('[data-cii-v11-empty]');
  const tableWrap = overlay.querySelector('[data-cii-v11-table-wrap]');
  const outputNameEl = overlay.querySelector('[data-cii-v11-output-name]');
  const overlapEl = overlay.querySelector('[data-cii-v11-overlap]');
  const runEl = overlay.querySelector('[data-cii-v11-run]');
  const downloadEl = overlay.querySelector('[data-cii-v11-download]');
  const reportEl = overlay.querySelector('[data-cii-v11-report]');
  const statusEl = overlay.querySelector('[data-cii-v11-status]');
  const logEl = overlay.querySelector('[data-cii-v11-log]');

  const setStatus = (message, kind = '') => {
    statusEl.textContent = message;
    statusEl.style.color = kind === 'error' ? '#ffaaaa' : kind === 'ok' ? '#9be3b0' : '#9fb1c6';
  };
  const setLog = (lines) => {
    const text = Array.isArray(lines) ? lines.filter(Boolean).join('\n') : String(lines || '');
    logEl.textContent = text;
    logEl.style.display = text ? 'block' : 'none';
  };
  const invalidateOutput = () => {
    state.mergedText = '';
    state.reportText = '';
    downloadEl.disabled = true;
    reportEl.disabled = true;
  };

  const renderRows = () => {
    emptyEl.style.display = state.entries.length ? 'none' : '';
    tableWrap.style.display = state.entries.length ? '' : 'none';
    rowsEl.innerHTML = state.entries.map((entry, index) => `
      <tr data-cii-v11-row="${index}" style="border-top:1px solid #26384d;">
        <td style="padding:8px 10px;color:#7f96af;">${index + 1}</td>
        <td style="padding:8px 10px;"><div style="font-weight:650;color:#dce7f3;">${esc(entry.file.name)}</div><div style="margin-top:2px;color:#75899f;">${Math.max(1, Math.round(entry.file.size / 1024))} KB</div></td>
        <td style="padding:8px 10px;"><input data-cii-v11-offset="${index}" inputmode="numeric" value="${esc(entry.offset)}" style="width:150px;background:#0c141e;color:#e7edf5;border:1px solid #3a4d64;border-radius:6px;padding:7px 8px;font-family:Consolas,monospace;"></td>
        <td style="padding:8px 10px;"><button type="button" data-cii-v11-remove="${index}" class="model-converters-download-btn">Remove</button></td>
      </tr>
    `).join('');
    if (state.entries.length && outputNameEl.value === 'Merged_Ver11.CII') {
      outputNameEl.value = `${baseName(state.entries[0].file.name)}_Merged_Ver11.CII`;
    }
  };

  filesInput.addEventListener('change', () => {
    for (const file of Array.from(filesInput.files || [])) {
      state.entries.push({ file, offset: 0 });
    }
    filesInput.value = '';
    invalidateOutput();
    setStatus(`${state.entries.length} file(s) loaded.`);
    renderRows();
  });

  rowsEl.addEventListener('input', (event) => {
    const input = event.target.closest('[data-cii-v11-offset]');
    if (!input) return;
    const index = Number(input.getAttribute('data-cii-v11-offset'));
    if (state.entries[index]) state.entries[index].offset = input.value;
    invalidateOutput();
  });
  rowsEl.addEventListener('click', (event) => {
    const button = event.target.closest('[data-cii-v11-remove]');
    if (!button) return;
    state.entries.splice(Number(button.getAttribute('data-cii-v11-remove')), 1);
    invalidateOutput();
    renderRows();
  });

  overlay.querySelector('[data-cii-v11-clear]').addEventListener('click', () => {
    state.entries = [];
    outputNameEl.value = 'Merged_Ver11.CII';
    invalidateOutput();
    setLog('');
    setStatus('');
    renderRows();
  });

  outputNameEl.addEventListener('input', invalidateOutput);
  overlapEl.addEventListener('change', invalidateOutput);

  runEl.addEventListener('click', async () => {
    invalidateOutput();
    setLog('');
    if (state.entries.length < 2) {
      setStatus('Add at least two CII files.', 'error');
      return;
    }
    let offsets;
    try {
      offsets = state.entries.map((entry, index) => normalizeOffset(entry.offset, index));
    } catch (error) {
      setStatus(error.message, 'error');
      return;
    }
    const rawOutputName = safeFileName(outputNameEl.value || 'Merged_Ver11.CII');
    const outputName = /\.cii$/i.test(rawOutputName) ? rawOutputName : `${rawOutputName}.CII`;
    const reportName = outputName.replace(/\.cii$/i, '.merge.json');
    runEl.disabled = true;
    setStatus('Loading Python merge runtime…');
    try {
      const pyodide = await ensurePythonRuntime();
      const stdout = [];
      const stderr = [];
      pyodide.setStdout({ batched: (text) => stdout.push(text) });
      pyodide.setStderr({ batched: (text) => stderr.push(text) });
      const jobDir = `/work/cii_v11_merge_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
      pyodide.FS.mkdirTree(jobDir);
      const inputPaths = [];
      const usedNames = new Set();
      for (let index = 0; index < state.entries.length; index += 1) {
        const entry = state.entries[index];
        let fileName = safeFileName(entry.file.name);
        if (usedNames.has(fileName.toLowerCase())) fileName = `${index + 1}_${fileName}`;
        usedNames.add(fileName.toLowerCase());
        const path = `${jobDir}/${fileName}`;
        pyodide.FS.writeFile(path, new Uint8Array(await entry.file.arrayBuffer()));
        inputPaths.push(path);
      }
      const outputPath = `${jobDir}/${outputName}`;
      const reportPath = `${jobDir}/${reportName}`;
      const argv = ['/scripts/cii2019_multi_merge.py'];
      for (const path of inputPaths) argv.push('--input', path);
      for (const offset of offsets) argv.push('--offset', String(offset));
      argv.push('--output', outputPath, '--report', reportPath);
      if (overlapEl.checked) argv.push('--allow-node-overlap');
      pyodide.globals.set('job_script_path', '/scripts/cii2019_multi_merge.py');
      pyodide.globals.set('job_argv', argv);
      setStatus('Merging CII files…');
      const exitCode = Number(await pyodide.runPythonAsync(RUN_SNIPPET));
      if (exitCode !== 0) {
        const detail = stderr.filter(Boolean).slice(-12).join('\n') || `Merge exited with code ${exitCode}.`;
        throw new Error(detail);
      }
      state.mergedText = pyodide.FS.readFile(outputPath, { encoding: 'utf8' });
      state.reportText = pyodide.FS.readFile(reportPath, { encoding: 'utf8' });
      state.outputName = outputName;
      const report = JSON.parse(state.reportText);
      const summary = `Merged ${report.inputs} files · ${report.elements} elements · ${report.unique_nodes} nodes · offsets [${(report.offsets || []).join(', ')}]`;
      setStatus(summary, 'ok');
      setLog([summary, ...(report.warnings || []).map((warning) => `WARNING: ${warning}`), ...stdout.filter(Boolean)]);
      downloadEl.disabled = false;
      reportEl.disabled = false;
    } catch (error) {
      const message = String(error?.message || error || 'Merge failed.');
      setStatus('Merge blocked.', 'error');
      setLog(message);
    } finally {
      runEl.disabled = false;
    }
  });

  downloadEl.addEventListener('click', () => {
    if (!state.mergedText) return;
    downloadOutput({ name: state.outputName, text: state.mergedText, mime: 'text/plain;charset=utf-8' });
  });
  reportEl.addEventListener('click', () => {
    if (!state.reportText) return;
    downloadOutput({ name: state.outputName.replace(/\.cii$/i, '.merge.json'), text: state.reportText, mime: 'application/json;charset=utf-8' });
  });

  const close = () => overlay.remove();
  overlay.querySelector('[data-cii-v11-close]').addEventListener('click', close);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  renderRows();
}

export function installCiiVer11MergeAddon(container) {
  if (!container || container.querySelector('[data-cii-v11-merge-launcher]')) return false;
  const root = container.querySelector('.model-converters-root') || container;
  const host = document.createElement('section');
  host.dataset.ciiV11MergeLauncher = ADDON_VERSION;
  host.style.cssText = 'margin:0 0 12px;padding:12px 14px;border:1px solid #33465e;border-radius:9px;background:#121d2a;display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;';
  host.innerHTML = `
    <div>
      <div style="font-weight:750;color:#dbe9f7;">CII Ver 11 Merge</div>
      <div style="margin-top:3px;color:#8fa2b8;font-size:12px;">Combine several CII Ver 11 / CII 2019 models with an explicit node offset per file.</div>
    </div>
    <button type="button" data-cii-v11-open class="model-converters-run-btn">Open CII Ver 11 Merge</button>
  `;
  root.prepend(host);
  host.querySelector('[data-cii-v11-open]').addEventListener('click', openMergeModal);
  return true;
}

export const __CII_VER11_MERGE_ADDON_VERSION__ = ADDON_VERSION;
