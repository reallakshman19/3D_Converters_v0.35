export const FBX_WASM_TARGET = 'wasm32-wasi';
export const FBX_WASM_REQUIRED_EXPORTS = Object.freeze([
  ['fbx_attribute_buffer_count', 'function'],
  ['fbx_attribute_buffer_len', 'function'],
  ['fbx_attribute_buffer_ptr', 'function'],
  ['fbx_attribute_error_len', 'function'],
  ['fbx_attribute_error_ptr', 'function'],
  ['fbx_attribute_parse', 'function'],
  ['fbx_attribute_result_len', 'function'],
  ['fbx_attribute_result_ptr', 'function'],
  ['fbx_error_len', 'function'],
  ['fbx_error_ptr', 'function'],
  ['fbx_geometry_buffer_count', 'function'],
  ['fbx_geometry_buffer_len', 'function'],
  ['fbx_geometry_buffer_ptr', 'function'],
  ['fbx_geometry_parse', 'function'],
  ['fbx_geometry_result_len', 'function'],
  ['fbx_geometry_result_ptr', 'function'],
  ['fbx_parse', 'function'],
  ['fbx_result_len', 'function'],
  ['fbx_result_ptr', 'function'],
  ['free', 'function'],
  ['malloc', 'function'],
  ['memory', 'memory'],
]);
export const FBX_WASM_REQUIRED_IMPORTS = Object.freeze([
  ['wasi_snapshot_preview1', 'fd_close', 'function'],
  ['wasi_snapshot_preview1', 'fd_seek', 'function'],
  ['wasi_snapshot_preview1', 'fd_write', 'function'],
]);

function compareTuple(left, right) {
  const a = JSON.stringify(left), b = JSON.stringify(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function exactTuples(actual, expected, label) {
  const left = [...actual].sort(compareTuple), right = [...expected].sort(compareTuple);
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    throw new Error(`FBX_WASM_ABI_INVALID ${label} differ: ${JSON.stringify(left)}`);
  }
  return Object.freeze(left.map((item) => Object.freeze(item)));
}

export function inspectFbxWasmAbi(bytes) {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const module = new WebAssembly.Module(source);
  const exports = WebAssembly.Module.exports(module).map(({ name, kind }) => [name, kind]);
  const imports = WebAssembly.Module.imports(module)
    .map(({ module: owner, name, kind }) => [owner, name, kind]);
  return Object.freeze({
    target: FBX_WASM_TARGET,
    exports: exactTuples(exports, FBX_WASM_REQUIRED_EXPORTS, 'exports'),
    imports: exactTuples(imports, FBX_WASM_REQUIRED_IMPORTS, 'imports'),
  });
}
