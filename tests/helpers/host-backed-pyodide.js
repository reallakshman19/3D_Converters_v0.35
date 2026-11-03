const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function runPython(repoRoot, args) {
  const result = spawnSync('python', args, { cwd: repoRoot, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error([
      `python ${args.join(' ')} failed with status ${result.status}`,
      result.stdout || '',
      result.stderr || '',
    ].filter(Boolean).join('\n'));
  }
}

class HostBackedPyodide {
  constructor(sandbox, repoRoot) {
    this.sandbox = sandbox;
    this.repoRoot = repoRoot;
    this.values = new Map();
    this.globals = { set: (key, value) => this.values.set(key, value) };
    this.FS = {
      mkdirTree: (target) => fs.mkdirSync(this.mapPath(target), { recursive: true }),
      writeFile: (target, value) => {
        const mapped = this.mapPath(target);
        fs.mkdirSync(path.dirname(mapped), { recursive: true });
        fs.writeFileSync(mapped, value, 'utf8');
      },
      readFile: (target) => fs.readFileSync(this.mapPath(target), 'utf8'),
    };
  }

  mapPath(target) {
    const value = String(target);
    if (value === '/scripts' || value.startsWith('/scripts/')) {
      return path.join(this.sandbox, value.slice(1));
    }
    return value;
  }

  runPython() {}

  async runPythonAsync(source) {
    const globalsPath = path.join(this.sandbox, 'job-globals.json');
    const snippetPath = path.join(this.sandbox, 'topology-stage.py');
    const runnerPath = path.join(this.sandbox, 'run-topology-stage.py');
    fs.writeFileSync(globalsPath, JSON.stringify(Object.fromEntries(this.values), null, 2), 'utf8');
    fs.writeFileSync(snippetPath, source, 'utf8');
    fs.writeFileSync(runnerPath, [
      'import json',
      'from pathlib import Path',
      'import sys',
      'globals_path, snippet_path, scripts_path = sys.argv[1:4]',
      'values = json.loads(Path(globals_path).read_text(encoding="utf-8"))',
      'globals().update(values)',
      'sys.path.insert(0, scripts_path)',
      'code = Path(snippet_path).read_text(encoding="utf-8")',
      'exec(compile(code, snippet_path, "exec"), globals())',
      '',
    ].join('\n'), 'utf8');
    runPython(this.repoRoot, [runnerPath, globalsPath, snippetPath, path.join(this.sandbox, 'scripts')]);
  }
}

module.exports = { HostBackedPyodide };
