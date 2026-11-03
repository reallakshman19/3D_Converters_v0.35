/**
 * rvm-invocation-builder-rvm.js
 * Extends the invocation builder pattern for native RVM conversion.
 */

export function buildRvmInvocation(primaryName, options = {}) {
    // rvmparser flags
    const argv = [
        '--output-gltf-attributes=true',
        '--output-gltf-center=true',
        '--output-gltf-rotate-z-to-y=true'
    ];

    // For web worker or direct api invocation we usually pass output names explicitly
    // This builder is mainly conceptually aligned with Agent 6 requirements.
    // The actual conversion server endpoint takes `inputBase64` and `attributesBase64`.

    return {
        argv,
        options
    };
}
