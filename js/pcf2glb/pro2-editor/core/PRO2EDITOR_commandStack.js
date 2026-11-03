// PRO2 Editor command stack.
//
// Commands must implement do() and undo(). Each new exec() clears redo history.

export function createCommandStack(logger) {
  const undo = [];
  const redo = [];

  function exec(cmd) {
    if (!cmd || typeof cmd.do !== 'function' || typeof cmd.undo !== 'function') return;
    cmd.do();
    undo.push(cmd);
    redo.length = 0;
    if (logger && typeof logger.debug === 'function') {
      logger.debug('UNDO', 'stack:exec', {
        undoDepth: undo.length,
        redoDepth: redo.length,
        cmd: cmd.name || cmd.constructor?.name || 'Command',
      });
    }
  }

  function undoOne() {
    const cmd = undo.pop();
    if (!cmd) return;
    cmd.undo();
    redo.push(cmd);
    if (logger && typeof logger.debug === 'function') {
      logger.debug('UNDO', 'stack:undo', { undoDepth: undo.length, redoDepth: redo.length });
    }
  }

  function redoOne() {
    const cmd = redo.pop();
    if (!cmd) return;
    cmd.do();
    undo.push(cmd);
    if (logger && typeof logger.debug === 'function') {
      logger.debug('UNDO', 'stack:redo', { undoDepth: undo.length, redoDepth: redo.length });
    }
  }

  return {
    exec,
    undo: undoOne,
    redo: redoOne,
    canUndo: () => undo.length > 0,
    canRedo: () => redo.length > 0,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createCommandStack };
}
