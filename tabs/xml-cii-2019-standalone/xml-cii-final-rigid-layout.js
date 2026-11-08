/**
 * Presentation-only layout for the final emitted CII review.
 *
 * Keeps the SAME modal, rows, controls, edit session and batch dialog alive
 * when maximizing/restoring. The table alone scrolls vertically; header and
 * footer remain visible. No CII values, source evidence or transactions change.
 */
const CSS = String.raw`
.mc-rigid-review-overlay {
  position:fixed !important; inset:0 !important; z-index:9990;
  display:flex !important; align-items:center !important; justify-content:center !important;
  padding:8px !important; box-sizing:border-box !important; overflow:hidden !important;
}
.mc-rigid-review-overlay .mc-rigid-review-dialog {
  box-sizing:border-box !important;
  display:flex !important; flex-direction:column !important;
  gap:6px !important; flex:0 1 auto !important;
  width:min(96vw,1700px) !important; max-width:none !important;
  height:min(94dvh,1100px) !important; max-height:calc(100dvh - 16px) !important;
  min-height:0 !important; padding:10px 12px !important; overflow:hidden !important;
}
.mc-rigid-review-overlay.mc-rigid-review-overlay--fullscreen {
  padding:6px !important;
}
.mc-rigid-review-overlay--fullscreen .mc-rigid-review-dialog {
  width:calc(100vw - 12px) !important;
  height:calc(100dvh - 12px) !important;
  max-height:calc(100dvh - 12px) !important;
  border-radius:5px !important;
}
.mc-rigid-review-dialog [data-final-rigid-header] {
  flex:none; min-height:0; padding-bottom:6px !important;
  margin-bottom:0 !important; gap:8px !important;
}
.mc-rigid-review-dialog [data-final-rigid-header] > div:first-child { min-width:0; }
.mc-rigid-review-dialog [data-final-rigid-title] {
  font-size:16px !important; line-height:1.2 !important;
}
.mc-rigid-review-dialog [data-final-rigid-subtitle] {
  margin-top:2px !important; font-size:11px !important;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.mc-rigid-review-dialog [data-final-rigid-header-actions] {
  display:flex; gap:6px; align-items:center; flex:none;
}
.mc-rigid-review-dialog [data-final-rigid-header-actions] button {
  padding:5px 9px !important; min-height:30px;
}
.mc-rigid-review-dialog [data-final-rigid-guidance] {
  flex:none; padding:5px 8px !important; margin-bottom:0 !important;
  font-size:11px !important;
}
.mc-rigid-review-dialog [data-final-rigid-guidance] summary { min-height:20px; }
.mc-rigid-review-dialog [data-final-rigid-controls] {
  flex:none; gap:6px !important; margin-bottom:0 !important;
}
.mc-rigid-review-dialog [data-final-rigid-controls] input,
.mc-rigid-review-dialog [data-final-rigid-controls] select {
  padding:5px 7px !important; font-size:12px;
}
.mc-rigid-review-dialog [data-final-rigid-search] {
  min-width:180px !important; width:clamp(190px,25vw,360px) !important;
  max-width:100% !important;
}
.mc-rigid-review-dialog [data-final-rigid-assessment] {
  flex:none; margin:0 !important; font-size:11px !important;
  line-height:1.2 !important;
}
.mc-rigid-review-dialog [data-final-rigid-batch-toolbar] {
  flex:none; margin:0 !important; padding:5px 8px !important;
}
.mc-rigid-review-dialog [data-final-rigid-batch-toolbar] > div:first-child {
  gap:6px !important;
}
.mc-rigid-review-dialog [data-final-rigid-batch-toolbar] button,
.mc-rigid-review-dialog [data-final-rigid-batch-toolbar] select,
.mc-rigid-review-dialog [data-final-rigid-batch-toolbar] input[type=number] {
  padding:4px 7px !important; font-size:11px !important;
}
.mc-rigid-review-dialog [data-final-rigid-batch-status] {
  margin-top:2px !important; line-height:1.2 !important;
  font-size:10px !important;
}
.mc-rigid-review-dialog [data-final-rigid-table-wrap] {
  flex:1 1 auto !important; min-height:120px !important;
  max-height:none !important; height:auto !important;
  margin:0 !important; overflow:auto !important;
  overscroll-behavior:contain; scrollbar-gutter:stable;
}
.mc-rigid-review-dialog [data-final-rigid-table-wrap] table {
  width:max-content; min-width:100%; border-collapse:collapse;
  font-size:11px !important; line-height:1.2;
}
.mc-rigid-review-dialog [data-final-rigid-table-wrap] thead {
  position:sticky; top:0; z-index:4; background:#1e293b;
}
.mc-rigid-review-dialog [data-final-rigid-table-wrap] th,
.mc-rigid-review-dialog [data-final-rigid-table-wrap] td {
  padding:4px 6px !important; line-height:1.25;
}
.mc-rigid-review-dialog [data-final-rigid-table-wrap] th:first-child,
.mc-rigid-review-dialog [data-final-rigid-table-wrap] td:first-child {
  position:sticky; left:0; z-index:2;
  background:#111e32; box-shadow:1px 0 0 #334155;
}
.mc-rigid-review-dialog [data-final-rigid-table-wrap] th:first-child {
  z-index:5; background:#1e293b;
}
.mc-rigid-review-dialog [data-final-rigid-table-wrap] input[type=text],
.mc-rigid-review-dialog [data-final-rigid-table-wrap] input[type=number] {
  box-sizing:border-box; padding:3px 5px !important; width:108px !important;
}
.mc-rigid-review-dialog [data-final-rigid-table-wrap] [data-final-rigid-nearest] button {
  padding:3px 5px !important; margin:0 !important; font-size:10px !important;
}
.mc-rigid-review-dialog [data-final-rigid-table-wrap] [data-final-rigid-nearest-caution] {
  display:none !important;
}
.mc-rigid-review-dialog [data-final-rigid-table-wrap] [data-final-rigid-basis-summary] {
  max-width:195px; font-size:11px; line-height:1.2;
}
.mc-rigid-review-dialog [data-final-rigid-footer] {
  flex:none; min-height:0; display:grid; align-items:center;
  grid-template-columns:minmax(0,1fr) auto; column-gap:6px; row-gap:3px;
  border-top:1px solid #334155; padding-top:5px;
}
.mc-rigid-review-dialog [data-final-rigid-footer] [data-final-rigid-actions] {
  margin:0 !important; gap:5px !important; min-width:0; max-width:100%;
}
.mc-rigid-review-dialog [data-final-rigid-footer] button {
  padding:5px 8px !important; font-size:11px; white-space:nowrap;
}
.mc-rigid-review-dialog [data-final-rigid-footer] [data-final-rigid-bottom-close] {
  margin:0 !important; align-self:center;
}
.mc-rigid-review-dialog [data-final-rigid-footer] [data-final-rigid-preview-report] {
  grid-column:1 / -1; box-sizing:border-box;
  display:block; max-height:35px !important; min-height:16px;
  margin:0 !important; padding:3px 6px; overflow:auto !important;
  line-height:1.15; border-top:1px solid #223044;
}
@media (max-width:1080px) {
  .mc-rigid-review-dialog [data-final-rigid-footer] [data-final-rigid-actions] {
    flex-wrap:nowrap !important; overflow-x:auto;
  }
}
@media (max-width:650px) {
  .mc-rigid-review-overlay { padding:3px !important; }
  .mc-rigid-review-overlay .mc-rigid-review-dialog {
    width:calc(100vw - 6px) !important;
    height:calc(100dvh - 6px) !important;
    max-height:calc(100dvh - 6px) !important;
    padding:7px !important;
  }
  .mc-rigid-review-dialog [data-final-rigid-title] { font-size:13px !important; }
  .mc-rigid-review-dialog [data-final-rigid-subtitle] { max-width:calc(100vw - 130px); }
  .mc-rigid-review-dialog [data-final-rigid-search] {
    flex:1 1 145px !important; min-width:120px !important;
  }
  .mc-rigid-review-dialog [data-final-rigid-footer] [data-final-rigid-actions] {
    flex-wrap:nowrap !important; overflow-x:auto;
  }
}
`;

export function installFinalRigidReviewLayout(overlay) {
  const dialog = overlay.querySelector('.mc-rigid-review-dialog');
  const tableWrap = dialog?.querySelector('[data-final-rigid-table-wrap]');
  const actions = dialog?.querySelector('[data-final-rigid-preview]')?.parentElement;
  const report = dialog?.querySelector('[data-final-rigid-preview-report]');
  const bottomClose = dialog?.querySelector('[data-final-rigid-bottom-close]');
  const toggle = dialog?.querySelector('[data-final-rigid-fullscreen]');
  if (!dialog || !tableWrap || !actions || !report || !bottomClose || !toggle)
    throw new Error('Final RIGID layout is missing a required review control.');

  const style = document.createElement('style');
  style.textContent = CSS;
  overlay.prepend(style);

  const footer = document.createElement('div');
  footer.setAttribute('data-final-rigid-footer', '');
  actions.setAttribute('data-final-rigid-actions', '');
  footer.append(actions, bottomClose, report);
  dialog.appendChild(footer);

  const setFullscreen = (enabled) => {
    const tableTop = tableWrap.scrollTop;
    const tableLeft = tableWrap.scrollLeft;
    const reportTop = report.scrollTop;
    overlay.classList.toggle('mc-rigid-review-overlay--fullscreen', Boolean(enabled));
    toggle.setAttribute('aria-pressed', String(Boolean(enabled)));
    toggle.setAttribute('aria-label', enabled ? 'Exit fullscreen' : 'Enter fullscreen');
    toggle.setAttribute('title', enabled ? 'Exit fullscreen' : 'Enter fullscreen');
    toggle.textContent = enabled ? '🗗' : '⛶';
    // Keep the same DOM nodes and transaction session; never rebuild rows.
    // Restore the scroll offsets after the layout is recalculated.
    requestAnimationFrame(() => {
      if (!overlay.isConnected) return;
      tableWrap.scrollTop = tableTop;
      tableWrap.scrollLeft = tableLeft;
      report.scrollTop = reportTop;
    });
  };
  toggle.addEventListener('click', () =>
    setFullscreen(!overlay.classList.contains('mc-rigid-review-overlay--fullscreen')));
  setFullscreen(false);
  return {
    isFullscreen: () => overlay.classList.contains('mc-rigid-review-overlay--fullscreen'),
    setFullscreen,
  };
}
