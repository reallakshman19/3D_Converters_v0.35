import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  FBX_WASM_REQUIRED_EXPORTS,
  FBX_WASM_REQUIRED_IMPORTS,
  FBX_WASM_TARGET,
  inspectFbxWasmAbi,
} from '../../tabs/model-converters/converters/fbx/wasm-abi.js';

export {
  FBX_WASM_REQUIRED_EXPORTS,
  FBX_WASM_REQUIRED_IMPORTS,
  FBX_WASM_TARGET,
  inspectFbxWasmAbi,
};

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error('Usage: node scripts/fbx/inspect-ufbx-wasm.mjs <wasm>');
  const result = inspectFbxWasmAbi(await readFile(path));
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
