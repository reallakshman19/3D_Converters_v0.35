/**
 * viewer/contracts/viewer-commands.js
 * Commands bound strictly to the UI/Viewer orchestration interactions.
 */

export const ViewerCommand = Object.freeze({
  FIT_ALL: 'FIT_ALL',
  FIT_SELECTION: 'FIT_SELECTION',
  TOGGLE_SECTION: 'TOGGLE_SECTION',
  TOGGLE_MEASURE: 'TOGGLE_MEASURE',
  SET_VIEW_MODE: 'SET_VIEW_MODE',
  CLEAR_SELECTION: 'CLEAR_SELECTION',
  TOGGLE_MARQUEE_ZOOM: 'TOGGLE_MARQUEE_ZOOM',
  TOGGLE_PROJECTION: 'TOGGLE_PROJECTION',
});

export function dispatchViewerCommand(ctx, cmd) {
  if (!ctx || !ctx.viewer) {
    console.warn('[dispatchViewerCommand] No viewer context available.', cmd);
    return;
  }

  switch (cmd.type) {
    case ViewerCommand.FIT_ALL:
      return ctx.viewer.fitAll?.();
    case ViewerCommand.FIT_SELECTION:
      return ctx.viewer.fitSelection?.();
    case ViewerCommand.TOGGLE_SECTION:
      if (cmd.payload?.mode) { return ctx.viewer.setSectionMode?.(cmd.payload.mode); } return ctx.viewer.disableSection?.();
    case ViewerCommand.TOGGLE_MEASURE:
      const curMode = ctx.viewer.getNavMode?.(); return ctx.viewer.setNavMode?.(curMode === 'measure' ? 'orbit' : 'measure');
    case ViewerCommand.SET_VIEW_MODE:
      if (cmd.payload?.mode === 'snap') { return ctx.viewer.snapToPreset?.(cmd.payload.preset); } return ctx.viewer.setNavMode?.(cmd.payload?.mode);
    case ViewerCommand.CLEAR_SELECTION:
      return ctx.viewer.clearSelection?.();
    case ViewerCommand.TOGGLE_MARQUEE_ZOOM:
      const mMode = ctx.viewer.getNavMode?.(); return ctx.viewer.setNavMode?.(mMode === 'marquee' ? 'orbit' : 'marquee');
    case ViewerCommand.TOGGLE_PROJECTION:
      return ctx.viewer.toggleProjection?.();
    default:
      console.warn(`[dispatchViewerCommand] Unsupported viewer command: ${cmd.type}`);
  }
}
