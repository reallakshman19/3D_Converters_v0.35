import * as THREE from 'three';

function canCreateWebGlContext() {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    const ok = !!context;
    const lose = context?.getExtension?.('WEBGL_lose_context');
    lose?.loseContext?.();
    return ok;
  } catch (_) {
    return false;
  }
}

function createWebGlRendererWithFallbacks() {
  const attempts = [
    // Lowest-risk default for large GLB/RVM scenes. preserveDrawingBuffer is very
    // expensive and can prevent context creation on memory-constrained GPUs.
    { antialias: true, alpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' },
    { antialias: false, alpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' },
    { antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: 'default' },
  ];

  const errors = [];
  for (const params of attempts) {
    try {
      return new THREE.WebGLRenderer(params);
    } catch (error) {
      errors.push(`${JSON.stringify(params)} -> ${error?.message || String(error)}`);
    }
  }

  const detail = errors.length ? ` Attempts: ${errors.join(' | ')}` : '';
  throw new Error(`Unable to create WebGL context. Close other 3D tabs/apps, refresh the page, or enable hardware acceleration.${detail}`);
}

export function createRenderer(container) {
  if (!canCreateWebGlContext()) {
    throw new Error('WebGL is unavailable in this browser/session. Enable hardware acceleration or try another browser/GPU session.');
  }

  const renderer = createWebGlRendererWithFallbacks();
  const width = Math.max(1, container.clientWidth || 1);
  const height = Math.max(1, container.clientHeight || 1);
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.localClippingEnabled = true; // Needed for phase 4 sectioning

  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    console.error('3D Viewer WebGL context lost. Reduce model/annotation density or refresh the page.');
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    console.info('3D Viewer WebGL context restored.');
  });

  container.appendChild(renderer.domElement);

  const handleResize = () => {
    const nextWidth = Math.max(1, container.clientWidth || 1);
    const nextHeight = Math.max(1, container.clientHeight || 1);
    renderer.setSize(nextWidth, nextHeight);
  };

  window.addEventListener('resize', handleResize);

  return {
    renderer,
    domElement: renderer.domElement,
    dispose: () => {
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    }
  };
}
