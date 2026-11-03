import { RvmDiagnostics } from '../rvm/RvmDiagnostics.js';

export class RvmGitHubActionsBridge {
    constructor() {
        this.githubPat = localStorage.getItem('rvm_github_pat') || '';
        this.repoOwner = 'reallaksh19';
        this.repoName = 'PCF_GLB_Viewer_Conv';
    }

    /**
     * Helper to update the PAT if the user provides it via UI
     */
    setPat(pat) {
        this.githubPat = pat;
        localStorage.setItem('rvm_github_pat', pat);
    }

    async probe() {
        // If we have a PAT, we consider the GitHub bridge reachable
        if (this.githubPat) {
            return { reachable: true, version: '1.0-github-actions' };
        }
        return { reachable: false };
    }

    async convertAndLoad(input, ctx, asyncSession) {
        if (!input.file) throw new Error("No RVM file provided");
        if (!this.githubPat) {
            throw new Error("GitHub PAT is required for serverless Assisted Mode. Please configure your PAT.");
        }

        asyncSession.update('manifest', 5);
        RvmDiagnostics.report('info', 'GitHub Actions Bridge', 'Starting remote serverless conversion...');

        const branchName = `rvm-job-${Date.now()}`;
        const fileName = input.file.name;

        try {
            // 1. Get the latest commit SHA of main branch
            asyncSession.update('manifest', 10);
            const mainRef = await this._githubApi(`git/ref/heads/main`);
            const baseSha = mainRef.object.sha;

            // 2. Create a new branch
            asyncSession.update('manifest', 15);
            await this._githubApi(`git/refs`, 'POST', {
                ref: `refs/heads/${branchName}`,
                sha: baseSha
            });

            // 3. Upload the RVM file to the job-input directory
            asyncSession.update('manifest', 25);
            const fileB64 = await this._fileToBase64(input.file);
            await this._githubApi(`contents/job-input/${fileName}`, 'PUT', {
                message: `Upload ${fileName} for processing`,
                content: fileB64,
                branch: branchName
            });

            // 4. Poll for the resulting GLB file in job-output
            asyncSession.update('glb', 30);
            RvmDiagnostics.report('info', 'GitHub Actions Bridge', `Waiting for GitHub Windows Runner on branch ${branchName}... (This may take 1-3 minutes)`);

            const glbStem = fileName.substring(0, fileName.lastIndexOf('.'));
            const outputGlbPath = `job-output/${glbStem}.glb`;

            let attempts = 0;
            let glbBase64 = null;

            while (attempts < 60) { // 60 attempts * 5s = 5 minutes max
                if (asyncSession.isCancelled()) {
                    throw new Error("Conversion cancelled by user.");
                }

                await new Promise(r => setTimeout(r, 5000));
                attempts++;

                try {
                    const resultFile = await this._githubApi(`contents/${outputGlbPath}?ref=${branchName}`);
                    if (resultFile && resultFile.content) {
                        glbBase64 = resultFile.content.replace(/\n/g, '');
                        break;
                    }
                } catch (e) {
                    // 404 means not ready yet, continue polling
                    if (e.message && e.message.includes('404')) {
                        asyncSession.update('glb', 30 + Math.min(60, attempts)); // update progress slightly
                        continue;
                    }
                    throw e;
                }
            }

            if (!glbBase64) {
                throw new Error("Timed out waiting for GitHub Actions runner to complete.");
            }

            asyncSession.update('index', 90);

            // Generate a default mock index since the runner might only output the raw GLB
            const bundleId = `github-job-${Date.now()}`;
            const indexJson = JSON.stringify({
                bundleId,
                schemaVersion: '1.0.0',
                modelClass: 'single-bundle',
                runtime: { units: 'mm', upAxis: 'Y', originOffset: [0,0,0], scale: 1 },
                nodes: []
            });

            // 5. Build Object URLs for the viewer pipeline
            const glbBlob = this._base64ToBlob(glbBase64, 'model/gltf-binary');
            const glbUrl = URL.createObjectURL(glbBlob);

            const indexBlob = new Blob([indexJson], { type: 'application/json' });
            const indexUrl = URL.createObjectURL(indexBlob);

            // Cleanup the branch asynchronously
            this._githubApi(`git/refs/heads/${branchName}`, 'DELETE').catch(e => console.warn('Failed to cleanup branch', e));

            // 6. Pass back to static loader
            return await ctx.staticBundleLoader.load({
                schemaVersion: 'rvm-bundle/v1',
                bundleId,
                runtime: { units: 'mm', upAxis: 'Y', scale: 1, originOffset: [0, 0, 0] },
                artifacts: {
                    glb: glbUrl,
                    index: indexUrl
                },
                coverage: { attributes: false, tree: false, supports: false, reviewTags: true }
            }, ctx, asyncSession);

        } catch (e) {
            RvmDiagnostics.report('error', 'GitHub Actions Bridge', e.message);
            throw new Error(`GitHub Actions conversion failed: ${e.message}`);
        }
    }

    async _githubApi(endpoint, method = 'GET', body = null) {
        const url = `https://api.github.com/repos/${this.repoOwner}/${this.repoName}/${endpoint}`;
        const headers = {
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': `token ${this.githubPat}`,
            'X-GitHub-Api-Version': '2022-11-28'
        };

        const options = { method, headers };
        if (body) {
            options.body = JSON.stringify(body);
        }

        const res = await fetch(url, options);
        if (!res.ok) {
            // Delete endpoints return 204 No Content
            if (method === 'DELETE' && res.status === 204) return null;
            throw new Error(`GitHub API error ${res.status}: ${res.statusText}`);
        }
        return await res.json();
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
        return new Blob(byteArrays, { type: mimeType });
    }
}
