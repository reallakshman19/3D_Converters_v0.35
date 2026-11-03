import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

function ensureFileReaderForNode() {
  if (typeof globalThis.FileReader !== 'undefined') return;
  if (typeof Blob === 'undefined') return;

  class NodeFileReader {
    constructor() {
      this.result = null;
      this.error = null;
      this.onload = null;
      this.onloadend = null;
      this.onerror = null;
    }

    addEventListener(type, listener) {
      if (type === 'load') this.onload = listener;
      else if (type === 'loadend') this.onloadend = listener;
      else if (type === 'error') this.onerror = listener;
    }

    removeEventListener(type, listener) {
      if (type === 'load' && this.onload === listener) this.onload = null;
      else if (type === 'loadend' && this.onloadend === listener) this.onloadend = null;
      else if (type === 'error' && this.onerror === listener) this.onerror = null;
    }

    async readAsArrayBuffer(blob) {
      try {
        this.result = await blob.arrayBuffer();
        this.onload?.({ target: this });
        this.onloadend?.({ target: this });
      } catch (error) {
        this.error = error;
        this.onerror?.({ target: this });
        this.onloadend?.({ target: this });
      }
    }

    async readAsDataURL(blob) {
      try {
        const buffer = Buffer.from(await blob.arrayBuffer());
        const mime = blob.type || 'application/octet-stream';
        this.result = `data:${mime};base64,${buffer.toString('base64')}`;
        this.onload?.({ target: this });
        this.onloadend?.({ target: this });
      } catch (error) {
        this.error = error;
        this.onerror?.({ target: this });
        this.onloadend?.({ target: this });
      }
    }
  }

  globalThis.FileReader = NodeFileReader;
}

export async function exportSceneToGLB(scene) {
  ensureFileReaderForNode();
  const exporter = new GLTFExporter();
  return new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (result) => {
        resolve(new Blob([result], { type: 'model/gltf-binary' }));
      },
      (error) => reject(error),
      { binary: true, onlyVisible: true, trs: false }
    );
  });
}
