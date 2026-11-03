const HOTFIX_VERSION = '20260704-json-trace-popup-binding-1';

function browserReady() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function rootFor(container = document) {
  return container?.querySelector?.('.model-converters-root') || container;
}

function markReleased(root) {
  if (!root?.dataset) return null;
  root.dataset.xmlCiiWorkflowLauncherHotfixBound = 'released';
  root.dataset.xmlCiiWorkflowLauncherHotfixReleased = HOTFIX_VERSION;
  return root;
}

export function installXmlCiiWorkflowLauncherHotfix(container = document) {
  if (!browserReady()) return null;
  return markReleased(rootFor(container));
}
