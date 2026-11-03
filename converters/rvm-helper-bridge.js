import { RvmCacheStore } from './rvm-cache-store.js';
import { RvmDiagnostics } from '../rvm/RvmDiagnostics.js';

// Module-level cache — probe only runs once per page session.
let _cachedProbeResult = null;

export class RvmHelperBridge {
    constructor() {
        this.endpoint = null;
    }

    async probe() {
        // Return cached result to avoid re-probing on every tab open.
        if (_cachedProbeResult !== null) {
            if (_cachedProbeResult.reachable) this.endpoint = _cachedProbeResult.endpoint;
            return { reachable: _cachedProbeResult.reachable, version: _cachedProbeResult.version };
        }

        const candidates = [
            'http://localhost:3001/api/native/rvm-to-rev',
            'http://localhost:3000/api/native/rvm-to-rev',
            'http://localhost:3200/api/native/rvm-to-rev',
        ];

        const tryOne = async (url) => {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 1500);
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    cache: 'no-store',
                    signal: ctrl.signal,
                    body: JSON.stringify({ mode: 'probe' }),
                });
                clearTimeout(timer);
                if (res.status === 404 || res.status === 405) return null;
                if (res.ok || res.status === 400 || res.status === 422) return url;
                return null;
            } catch {
                clearTimeout(timer);
                return null;
            }
        };

        // Race all candidates in parallel — first non-null wins.
        const results = await Promise.all(candidates.map(tryOne));
        const found = results.find(r => r !== null) || null;

        if (found) {
            this.endpoint = found;
            _cachedProbeResult = { reachable: true, endpoint: found, version: '1.0' };
            console.log(`[RvmHelperBridge] Found active local backend at: ${found}`);
            return { reachable: true, version: '1.0' };
        }

        _cachedProbeResult = { reachable: false, endpoint: null, version: null };
        this.endpoint = null;
        return { reachable: false };
    }

    /**
     * Re-uses the static loader after successful conversion
     */
    async convertAndLoad(input, ctx, asyncSession) {
        if (!input.file) throw new Error("No RVM/REV file provided");
        if (!this.endpoint) {
            const probeResult = await this.probe();
            if (!probeResult?.reachable || !this.endpoint) {
                throw new Error("Native RVM bridge is not reachable. Start local server (node test_server.js) before importing raw RVM.");
            }
        }
        const inputName = String(input.file.name || '').toLowerCase();
        if (!inputName.endsWith('.rvm') && !inputName.endsWith('.rev')) {
            throw new Error(`Unsupported input file "${input.file.name}". Native bridge accepts .rvm or .rev files.`);
        }

        asyncSession.update('manifest', 5);

        // Deterministic grouping (assumes input has .file and optionally .sidecars)
        // .att over .txt
        let attFile = null;
        if (input.sidecars && input.sidecars.length > 0) {
            attFile = input.sidecars.find(f => f.name.toLowerCase().endsWith('.att'));
            if (!attFile) {
                attFile = input.sidecars.find(f => f.name.toLowerCase().endsWith('.txt'));
            }

            // Log conflicts if multiple files exist
            if (input.sidecars.length > 1 && !attFile) {
                RvmDiagnostics.report('warning', 'Sidecar matching', 'Multiple sidecars found but no valid .att or .txt');
            }
        }

        // SHA256 Check omitted for browser File API simplicity here unless we have a fast hash sync,
        // typically requires async hash buffer. For MVP agent 6 cache we mock a hash by name + size
        const mockSha = `${input.file.name}_${input.file.size}`;
        const cached = RvmCacheStore.get(mockSha);

        if (cached) {
            RvmDiagnostics.report('info', 'Cache', 'Loading converted bundle from cache');
            return await ctx.staticBundleLoader.load({
                schemaVersion: 'rvm-bundle/v1',
                bundleId: cached.bundleId,
                runtime: { units: 'mm', upAxis: 'Y', scale: 1, originOffset: [0, 0, 0] },
                artifacts: {
                    glb: cached.glbPath,
                    index: cached.indexPath
                },
                coverage: { attributes: true, tree: true, supports: false, reviewTags: true }
            }, ctx, asyncSession);
        }

        asyncSession.update('manifest', 15);

        // Base64 encode for API (MVP flow, for production chunked upload is better)
        const fileB64 = await this._fileToBase64(input.file);
        let attB64 = null;
        if (attFile) {
            attB64 = await this._fileToBase64(attFile);
        }

        asyncSession.update('glb', 30); // Actually converting

        try {
            // Note: The native API currently outputs .rev in the test server.
            // Agent 6 requirement is rvm_to_glb. The server `handleNativeRvmToRev` in `test_server_3001.js`
            // needs to support `--output-gltf`.
            // We will modify the test server logic as instructed.

            const payload = {
                inputName: input.file.name,
                inputBase64: fileB64,
                attributesName: attFile ? attFile.name : undefined,
                attributesBase64: attB64,
                mode: 'rvm_to_glb' // Signal to modified server
            };

            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`Server conversion failed: ${errorData.error || response.statusText}`);
            }

            const data = await response.json();

            // data should contain base64 glb and index json
            if (!data.glbBase64 || !data.indexJson) {
                throw new Error("Server did not return valid GLB and Index data");
            }

            // Create Object URLs for the static loader to consume
            const glbBlob = this._base64ToBlob(data.glbBase64, 'model/gltf-binary');
            const glbUrl = URL.createObjectURL(glbBlob);

            const indexStr = typeof data.indexJson === 'string' ? data.indexJson : JSON.stringify(data.indexJson);
            const indexBlob = new Blob([indexStr], { type: 'application/json' });
            const indexUrl = URL.createObjectURL(indexBlob);

            const bundleId = `converted-${Date.now()}`;
            RvmCacheStore.set(mockSha, bundleId, glbUrl, indexUrl);

            // Pass to static loader
            return await ctx.staticBundleLoader.load({
                schemaVersion: 'rvm-bundle/v1',
                bundleId,
                runtime: { units: 'mm', upAxis: 'Y', scale: 1, originOffset: [0, 0, 0] },
                artifacts: {
                    glb: glbUrl,
                    index: indexUrl
                },
                coverage: { attributes: !!attFile, tree: true, supports: false, reviewTags: true }
            }, ctx, asyncSession);

        } catch (e) {
            throw new Error(`Assisted conversion failed: ${e.message}`);
        }
    }

    _fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = error => reject(error);
        });
    }

    _base64ToBlob(base64, mimeType) {
        const byteCharacters = atob(base64);
        const byteArrays = [];
        for (let offset = 0; offset < byteCharacters.length; offset += 512) {
            const slice = byteCharacters.slice(offset, offset + 512);
            const byteNumbers = new Array(slice.length);
            for (let i = 0; i < slice.length; i++) {
                byteNumbers[i] = slice.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            byteArrays.push(byteArray);
        }
        return new Blob(byteArrays, {type: mimeType});
    }
}
