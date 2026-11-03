/**
 * Pcfx_FileIO.js
 * Browser file open/download helpers for converter inputs and `.pcfx` outputs.
 * Inputs are files, text, or blobs. Outputs are Files, text strings, ArrayBuffers, or downloads.
 */

import { stringifyPcfxDocument } from './Pcfx_Core.js';

function clickHiddenInput(accept) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const file = input.files && input.files[0] ? input.files[0] : null;
      input.remove();
      if (!file) {
        reject(new Error('No file selected.'));
        return;
      }
      resolve(file);
    }, { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Open a `.pcfx` file through the browser file picker.
 * @returns {Promise<File>}
 */
export function openPcfxFile() {
  return clickHiddenInput('.pcfx,.json');
}

/**
 * Read a file as UTF-8 text.
 * @param {File} file
 * @returns {Promise<string>}
 */
export function readTextFile(file) {
  if (!file) throw new Error('A file is required to read text.');
  return file.text();
}

/**
 * Read a file as an ArrayBuffer.
 * @param {File} file
 * @returns {Promise<ArrayBuffer>}
 */
export function readArrayBufferFile(file) {
  if (!file) throw new Error('A file is required to read binary data.');
  return file.arrayBuffer();
}

/**
 * Download a blob with a chosen file name.
 * @param {Blob} blob
 * @param {string} fileName
 * @returns {void}
 */
export function downloadBlob(blob, fileName) {
  if (!blob) throw new Error('A blob is required for download.');
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

/**
 * Download plain text with the provided MIME type.
 * @param {string} text
 * @param {string} fileName
 * @param {string} mimeType
 * @returns {void}
 */
export function downloadText(text, fileName, mimeType) {
  const blob = new Blob([String(text)], { type: mimeType });
  downloadBlob(blob, fileName);
}

/**
 * Serialize and download a `.pcfx` document.
 * @param {object} doc
 * @param {string} fileName
 * @returns {void}
 */
export function downloadPcfxDocument(doc, fileName) {
  const outputName = fileName || 'converter-output.pcfx';
  downloadText(stringifyPcfxDocument(doc), outputName, 'application/json');
}
