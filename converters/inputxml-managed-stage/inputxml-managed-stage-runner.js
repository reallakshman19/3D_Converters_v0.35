import { buildInputXmlDirectManagedStageJson } from './InputXmlDirectManagedStageBuilder.js';
import { buildInputXmlManagedStageUxmlText } from './InputXmlDirectManagedStageUxmlSidecar.js';

function text(value) { return String(value ?? '').trim(); }
async function readFileText(file) {
  if (typeof file?.text === 'string') return file.text;
  if (file?.bytes instanceof Uint8Array) return new TextDecoder('utf-8').decode(file.bytes);
  if (file?.bytes instanceof ArrayBuffer) return new TextDecoder('utf-8').decode(new Uint8Array(file.bytes));
  if (typeof file?.file?.text === 'function') return file.file.text();
  if (typeof file?.text === 'function') return file.text();
  return '';
}
function baseName(name) {
  const stem = text(name).replace(/\.[^.]+$/, '') || 'inputxml';
  return stem.replace(/[^A-Za-z0-9_.-]+/g, '_');
}

export async function run(ctx = {}) {
  const stdout = [];
  const stderr = [];
  const file = (ctx.inputFiles || []).find((entry) => entry?.role === 'primary') || ctx.inputFiles?.[0];
  const sourceName = file?.name || 'input.xml';
  try {
    if (!file) throw new Error('Select a primary InputXML file first.');
    ctx.setStatus?.('Reading InputXML for direct stagedJSON conversion...', 'running');
    const xmlText = await readFileText(file);
    if (!xmlText.trim()) throw new Error('File is empty or could not be read.');
    const staged = buildInputXmlDirectManagedStageJson(xmlText, { sourceName, ...(ctx.options || {}) });
    const outName = `${baseName(sourceName)}_managed_stage.json`;
    const outputs = [{ name: outName, text: JSON.stringify(staged, null, 2), mime: 'application/json' }];
    if (ctx.options?.includeUxmlSidecar !== false) {
      outputs.push({
        name: `${baseName(sourceName)}_managed_stage.uxml.json`,
        text: buildInputXmlManagedStageUxmlText(staged, {
          stem: baseName(sourceName),
          inputName: sourceName,
          projectId: 'INPUTXML_DIRECT_MANAGED_STAGE',
          scopeStats: staged.stats,
        }),
        mime: 'application/json',
      });
    }
    if (ctx.options?.includeAuditJson !== false) {
      outputs.push({ name: `${baseName(sourceName)}_managed_stage.audit.json`, text: JSON.stringify({ schema: 'inputxml-direct-managed-stage-audit/v1', source: sourceName, stats: staged.stats, audit: staged.audit }, null, 2), mime: 'application/json' });
    }
    stdout.push(`Direct stagedJSON: components=${staged.stats.components}, restraintRows=${staged.stats.restraintRows}, validRestraints=${staged.stats.validRestraints}, emittedSupports=${staged.stats.emittedSupports}, blankRestraintRows=${staged.stats.blankRestraintRows}, bends=${staged.stats.bends}, rigids=${staged.stats.rigids}, sifElements=${staged.stats.sifElements}, richGeometryComponents=${staged.stats.richGeometryComponents}, uxmlReadyComponents=${staged.stats.uxmlReadyComponents}`);
    ctx.setStatus?.(`Completed: ${outName}`, 'ok');
    return { ok: true, outputs, logs: { stdout, stderr }, diagnostics: [{ severity: 'INFO', message: stdout[0] }] };
  } catch (error) {
    const message = error?.message || String(error);
    stderr.push(message);
    ctx.setStatus?.(`Failed: ${message}`, 'bad');
    return { ok: false, outputs: [], logs: { stdout, stderr }, diagnostics: [{ severity: 'ERROR', message }] };
  }
}
