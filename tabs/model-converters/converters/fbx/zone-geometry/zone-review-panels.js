import {
  installBranchFittingReviewUi,
  renderBranchFittingReviewUi,
  setBranchFittingDownloadAvailability,
} from '../fitting-kernels/branch-fitting/review-ui.js';
import {
  installConnectivityReviewUi,
  renderConnectivityReviewUi,
  setConnectivityDownloadAvailability,
} from '../fitting-kernels/connectivity/review-ui.js';
import {
  installInlineAssemblyReviewUi,
  renderInlineAssemblyReviewUi,
  setInlineAssemblyDownloadAvailability,
} from '../fitting-kernels/inline-assembly/review-ui.js';
import {
  installPrimaryFittingReviewUi,
  renderPrimaryFittingReviewUi,
  setPrimaryFittingDownloadAvailability,
} from '../fitting-kernels/primary-fitting/review-ui.js';
import {
  installGeneratedGapPipeReviewUi,
  renderGeneratedGapPipeReviewUi,
  setGeneratedGapPipeDownloadAvailability,
} from '../generated-gap-pipe/review-ui.js';

function installReviewHost(wrap) {
  const analysisPanel = wrap.querySelector?.('[data-fbx-zone-analysis-panel]');
  if (analysisPanel) analysisPanel.style.gridColumn = '1 / -1';
  const details = document.createElement('details');
  details.dataset.fbxZoneReviewPanels = 'true';
  details.style.cssText = 'grid-column:1 / -1;width:100%;border:1px solid #2b3d55;border-radius:8px;background:#0d1623;box-sizing:border-box;';
  details.innerHTML = `
    <summary style="cursor:pointer;padding:9px 10px;color:#9cc5ff;font-size:12px;font-weight:700;user-select:none;">
      Detailed fitting, connectivity and generated-component evidence
    </summary>
    <div data-fbx-zone-review-panels-body style="display:grid;gap:8px;padding:0 10px 10px;"></div>`;
  wrap.appendChild(details);
  return { details, body: details.querySelector('[data-fbx-zone-review-panels-body]') };
}

export function installZoneReviewPanels(wrap) {
  const host = installReviewHost(wrap);
  return Object.freeze({
    host,
    connectivity: installConnectivityReviewUi(host.body),
    generatedGapPipe: installGeneratedGapPipeReviewUi(host.body),
    primaryFitting: installPrimaryFittingReviewUi(host.body),
    branchFitting: installBranchFittingReviewUi(host.body),
    inlineAssembly: installInlineAssemblyReviewUi(host.body),
  });
}

export function renderZoneReviewPanels(panels, result) {
  renderConnectivityReviewUi(
    panels?.connectivity, result?.connectivityReview || null);
  renderGeneratedGapPipeReviewUi(
    panels?.generatedGapPipe, result?.generatedGapPipeReview || null);
  renderPrimaryFittingReviewUi(
    panels?.primaryFitting, result?.primaryFittingReview || null);
  renderBranchFittingReviewUi(
    panels?.branchFitting, result?.branchFittingReview || null);
  renderInlineAssemblyReviewUi(
    panels?.inlineAssembly, result?.inlineAssemblyReview || null);
}

export function updateZoneReviewDownloads(panels, state, complete) {
  setConnectivityDownloadAvailability(
    panels?.connectivity, complete && Boolean(state.connectivityJson));
  setGeneratedGapPipeDownloadAvailability(
    panels?.generatedGapPipe, complete && Boolean(state.generatedGapPipeJson));
  setPrimaryFittingDownloadAvailability(panels?.primaryFitting, {
    elbow: complete && Boolean(state.elbowJson),
    tee: complete && Boolean(state.teeJson),
    reducer: complete && Boolean(state.reducerJson),
  });
  setBranchFittingDownloadAvailability(
    panels?.branchFitting, complete && Boolean(state.branchFittingJson));
  setInlineAssemblyDownloadAvailability(
    panels?.inlineAssembly, complete && Boolean(state.inlineAssemblyJson));
}

export function bindZoneReviewDownloads(panels, onDownload) {
  panels.connectivity.download.addEventListener('click', () => onDownload('connectivity'));
  panels.generatedGapPipe.download.addEventListener('click', () => onDownload('generated-gap-pipe'));
  panels.primaryFitting.downloads.elbow.addEventListener('click', () => onDownload('elbow'));
  panels.primaryFitting.downloads.tee.addEventListener('click', () => onDownload('tee'));
  panels.primaryFitting.downloads.reducer.addEventListener('click', () => onDownload('reducer'));
  panels.branchFitting.download.addEventListener('click', () => onDownload('branch-fitting'));
  panels.inlineAssembly.download.addEventListener('click', () => onDownload('inline-assembly'));
}
