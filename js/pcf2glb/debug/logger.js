export function createLogger(maxEntries = 1000) {
  const entries = [];
  const listeners = new Set();

  function push(level, code, data = {}) {
    const entry = {
      ts: new Date().toISOString(),
      level,
      code,
      data,
    };
    entries.push(entry);
    if (entries.length > maxEntries) entries.shift();
    for (const fn of listeners) fn(entry, [...entries]);
  }

  return {
    info: (code, data) => push('INFO', code, data),
    warn: (code, data) => push('WARN', code, data),
    error: (code, data) => push('ERROR', code, data),
    getEntries: () => [...entries],
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    clear: () => {
      entries.length = 0;
    },
  };
}
