/**
 * Service boundary for XML->CII master/config operations.
 * Inputs: a bridge provider and optional cache invalidator.
 * Outputs: explicit master/config methods used by popup UI.
 * Fallback: if the bridge is unavailable, methods return null/empty text.
 */

export function createXmlCiiMasterService(getBridge, invalidateSnapshot) {
  const bridge = () => getBridge?.() || null;
  const invalidate = () => invalidateSnapshot?.();

  return {
    importFile(masterKey, file) {
      return bridge()?.importPopupMasterFile?.(masterKey, file) || null;
    },
    loadDefault(masterKey) {
      return bridge()?.loadPopupDefaultMaster?.(masterKey) || null;
    },
    autoMap(masterKey) {
      const result = bridge()?.autoMapPopupMaster?.(masterKey) || null;
      invalidate();
      return result;
    },
    setField(masterKey, fieldName, value) {
      const result = bridge()?.setPopupMasterField?.(masterKey, fieldName, value) || null;
      invalidate();
      return result;
    },
    save(masterKey) {
      const result = bridge()?.savePopupMaster?.(masterKey) || null;
      invalidate();
      return result;
    },
    applyLineListMappingTemplate(fileName) {
      const result = bridge()?.applyPopupLineListMappingTemplate?.(fileName) || null;
      invalidate();
      return result;
    },
    clear(masterKey) {
      const result = bridge()?.clearPopupMaster?.(masterKey) || null;
      invalidate();
      return result;
    },
    saveConfigText(text, bools) {
      const result = bridge()?.savePopupConfigText?.(text, bools) || '';
      invalidate();
      return result;
    },
    importConfigText(text) {
      const result = bridge()?.importPopupConfigText?.(text) || null;
      invalidate();
      return result;
    },
    exportConfigText() {
      return bridge()?.exportPopupConfigText?.() || '{}';
    },
    setConfigValue(path, value, type) {
      const result = bridge()?.setPopupConfigValue?.(path, value, type) || null;
      invalidate();
      return result;
    },
  };
}
