// Guarded startup for the standalone FormatConverters app.
function startupMount() {
  return document.getElementById('app') || document.getElementById('app-layout') || document.getElementById('app-shell') || document.body;
}

function reportStartupError(error) {
  console.error('FormatConverters startup error', error);
  const root = startupMount();
  if (!root) return;
  root.innerHTML = '<div class="tab-error"><h2>FormatConverters startup error</h2><pre>' + String(error?.message || error) + '</pre></div>';
}

async function startStandaloneApp() {
  const module = await import('./core/app.js?v=20260816-cii-v11-v14-dropdown-release-4');
  await module.init(startupMount());
}

startStandaloneApp().catch(reportStartupError);
