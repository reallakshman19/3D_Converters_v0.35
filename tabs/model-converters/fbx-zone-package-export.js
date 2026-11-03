import { buildSupportAssemblyReviewModel,
  SUPPORT_ASSEMBLY_POLICY_TEXT,
  supportAssemblySummaryText } from './converters/fbx/support-assembly/review-model.js';
import { installFbxTayaSupportQualification } from
  './converters/fbx/taya-qualification/ui.js';
import { buildSelectedZonePackage } from './converters/fbx/zone-package/package-builder.js';
import { buildPackageArchive } from './converters/fbx/zone-package/archive.js';

const BUTTON_ATTR = 'data-fbx-zone-package-export';
const STATUS_ATTR = 'data-fbx-zone-package-export-status';
const POLICY_ATTR = 'data-fbx-support-host-policy';
const INSTALL_MARKER = Symbol.for('model-converters.fbx-zone-package-export.v2');
const PACKAGE_INPUT_EVENT = 'model-converters:fbx-zone-package-inputs';
const POLICY_TEXT = [
  'Support host association uses only admitted PIPE classifications and exact polygon-to-cylinder contact witnesses.',
  'No nearest-pipe fallback or source-name inference is used.',
  SUPPORT_ASSEMBLY_POLICY_TEXT,
].join(' ');
function statusElementFor(container) { return container?.querySelector?.(`[${STATUS_ATTR}]`) || null; }
function reportStatus(container, text) { const status = statusElementFor(container); if (status) status.textContent = text; }
function triggerBoundedDownload(bytes, fileName) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = fileName;
  document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 0);
}
function qualificationText(inputs) {
  const root = inputs?.qualificationRoot;
  if (!root) return 'qualification unavailable';
  const checks = `${root.summary?.passCount || 0}/${root.summary?.checkCount || 0} checks`;
  return root.status === 'PASS' ? `qualification PASS, ${checks}`
    : `qualification BLOCKED, ${checks}`;
}
function supportText(inputs) {
  const count = inputs?.supportEvidence?.candidates?.length;
  return Number.isInteger(count) ? `${count} support candidate${count === 1 ? '' : 's'}`
    : 'support evidence unavailable';
}
function hostText(inputs) {
  const evidence = inputs?.supportHostAssociationEvidence;
  if (!evidence?.counts) return 'support host evidence unavailable';
  const counts = evidence.counts;
  const proved = counts.singleHostCount + counts.multiHostCount;
  return `${proved}/${counts.candidateCount} support hosts proved, `
    + `${counts.hostNotFoundCount} not found, ${counts.hostAmbiguousCount} ambiguous`;
}
function assemblyText(inputs) {
  return supportAssemblySummaryText(buildSupportAssemblyReviewModel(
    inputs?.supportAssemblyEvidence));
}
function packageStatusText(inputs) {
  return [qualificationText(inputs), supportText(inputs), hostText(inputs),
    assemblyText(inputs)].join(', ');
}
async function exportSelectedZonePackage(container, inputs) {
  if (!inputs) { reportStatus(container, 'Analyse a selected FBX zone before exporting.'); return; }
  reportStatus(container, `Building selected-zone package (${packageStatusText(inputs)})...`);
  const { files, audit } = await buildSelectedZonePackage(inputs);
  const archive = await buildPackageArchive(files);
  triggerBoundedDownload(archive.bytes, `${inputs.fileNamePrefix || 'selected-zone'}.fbxzonepkg`);
  reportStatus(container, `Package exported: ${packageStatusText(inputs)}, ${audit.geometryCount} geometries, ${files.length} files, digest ${archive.sha256.slice(0, 12)}...`);
}
function mountButton(container) {
  const existing = container.querySelector?.(`[${BUTTON_ATTR}]`); if (existing) return existing;
  const host = container.querySelector('[data-fbx-preview-zone-wrap]') || container;
  const wrap = document.createElement('span');
  wrap.innerHTML = `<button type="button" ${BUTTON_ATTR} class="model-converters-download-btn" disabled>Download zone package</button>`
    + `<span ${POLICY_ATTR} title="${POLICY_TEXT}" aria-label="Support host and assembly policy" style="cursor:help;margin-left:6px;">ⓘ</span>`
    + `<span ${STATUS_ATTR} style="color:#9aa8ba;margin-left:8px;"></span>`;
  host.appendChild(wrap); return wrap.querySelector(`[${BUTTON_ATTR}]`);
}
export function installFbxZonePackageExport(container, getPackageInputs = null) {
  if (typeof document === 'undefined' || !container || container[INSTALL_MARKER]) return;
  Object.defineProperty(container, INSTALL_MARKER, { value: true });
  const button = mountButton(container); if (!button) return;
  installFbxTayaSupportQualification(container);
  let latestInputs = null;
  const provided = typeof getPackageInputs === 'function' ? getPackageInputs : null;
  const update = (inputs) => {
    latestInputs = inputs || null; button.disabled = !latestInputs;
    reportStatus(container, latestInputs
      ? `Selected-zone package is ready: ${packageStatusText(latestInputs)}.`
      : 'Analyse a selected FBX zone before exporting.');
  };
  window.addEventListener(PACKAGE_INPUT_EVENT, (event) => update(event.detail?.inputs || null));
  update(null);
  button.addEventListener('click', () => {
    Promise.resolve(provided ? provided() : null)
      .then((inputs) => exportSelectedZonePackage(container, inputs || latestInputs))
      .catch((error) => reportStatus(container, `Zone package export failed: ${error?.message || error}`));
  });
}
