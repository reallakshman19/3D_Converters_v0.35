import { CanonicalDiagnostics } from './CanonicalDiagnostics.js';

export class CanonicalProject {
  constructor({ id = 'project-1', name = 'Model Exchange Project', metadata = {} } = {}) {
    this.id = id;
    this.name = name;
    this.metadata = metadata;
    this.sourceFiles = [];
    this.assemblies = [];
    this.diagnostics = new CanonicalDiagnostics();
  }

  addSourceFile(sourceFile) {
    this.sourceFiles.push(sourceFile);
    return sourceFile;
  }

  addAssembly(assembly) {
    this.assemblies.push(assembly);
    return assembly;
  }
}
