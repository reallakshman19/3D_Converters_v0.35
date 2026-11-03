export function createDebugPanel(container) {
  const logs = [];
  const maxLogs = 500;

  const renderLogs = () => {
      if (!container) return;
      let html = '';
      logs.slice(-50).forEach(log => {
          html += `<div style="margin-bottom:4px; padding-bottom:4px; border-bottom:1px solid #333;">
              <span style="color:${log.level === 'error' ? 'red' : log.level === 'warn' ? 'orange' : '#88f'};">[${log.level.toUpperCase()}]</span>
              <span style="color:#aaa;">${log.channel}</span>
              <span>${log.message}</span>
              ${log.payload ? `<br/><span style="color:#666;">${JSON.stringify(log.payload)}</span>` : ''}
          </div>`;
      });
      container.innerHTML = html;
      container.scrollTop = container.scrollHeight;
  };

  return {
    log: (channel, level, message, payload) => {
        logs.push({ ts: new Date().toISOString(), channel, level, message, payload });
        if (logs.length > maxLogs) logs.shift();
        renderLogs();
    },
    getLogs: () => logs,
    exportDiagnostics: () => ({ logs })
  };
}
