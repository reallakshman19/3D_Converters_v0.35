import { splitPcfBlocks } from './splitPcfBlocks.js';

export function parsePcfText(text, log) {
  const blocks = splitPcfBlocks(text, log);

  const parsed = {
    meta: {
      sourceFile: 'unknown',
      lineCount: text.split('\n').length,
    },
    blocks: blocks,
    warnings: [],
  };

  return parsed;
}
