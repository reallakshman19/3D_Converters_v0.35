import { state } from '../core/state.js';
import { RvmDiagnostics } from './RvmDiagnostics.js';
import { emit } from '../core/event-bus.js';
import { RuntimeEvents } from '../contracts/runtime-events.js';
import { AvevaJsonLoader } from './AvevaJsonLoader.js';

/**
 * Tracks an active load session to prevent race conditions and partial state leaks.
 * Only the latest loadId is permitted to commit changes to the state.
 */
export class RvmAsyncSession {
  constructor() {
    this.loadId = crypto.randomUUID();
    this.status = 'loading'; // idle | loading | loaded | error | cancelled
    this.phase = 'manifest'; // manifest | glb | index | tags | build-tree | done
    this.progress = 0;
    this.startedAt = Date.now();
    this.cancelledAt = null;
    this.error = null;

    // Persist to state
    state.rvm.asyncLoad = {
      loadId: this.loadId,
      status: this.status,
      phase: this.phase,
      progress: this.progress,
      error: this.error,
    };
  }

  /**
   * Updates phase and progress.
   */
  update(phase, progress) {
    if (this.isStale() || this.isCancelled()) return;
    this.phase = phase;
    this.progress = progress;
    this._syncState();
  }

  /**
   * Completes the session successfully.
   */
  complete() {
    if (this.isStale() || this.isCancelled()) return;
    this.status = 'loaded';
    this.phase = 'done';
    this.progress = 100;
    this._syncState();
  }

  /**
   * Fails the session.
   */
  fail(errorMsg) {
    if (this.isStale() || this.isCancelled()) return;
    this.status = 'error';
    this.error = errorMsg;
    this._syncState();
  }

  /**
   * Cancels the session explicitly.
   */
  cancel() {
    if (this.isStale() || this.isCancelled()) return;
    this.status = 'cancelled';
    this.cancelledAt = Date.now();
    this._syncState();

    // reset viewer state slightly? We just rely on stale checks to prevent commit
  }

  /**
   * Returns true if a newer session has been started.
   */
  isStale() {
    return state.rvm.asyncLoad.loadId !== this.loadId;
  }

  isCancelled() {
    return this.status === 'cancelled';
  }

  _syncState() {
    state.rvm.asyncLoad.status = this.status;
    state.rvm.asyncLoad.phase = this.phase;
    state.rvm.asyncLoad.progress = this.progress;
    state.rvm.asyncLoad.error = this.error;
    emit(RuntimeEvents.RVM_CONFIG_CHANGED, { reason: 'async-load-update' });
  }
}

/**
 * Unified load entry for RVM.
 *
 * @param {object} input { kind: 'bundle', bundle: object } | { kind: 'raw-rvm', file: File }
 * @param {object} ctx Context containing dependencies { capabilities, staticBundleLoader, assistedBridge }
 */
export async function loadRvmSource(input, ctx) {
  const { capabilities } = ctx;
  const asyncSession = new RvmAsyncSession();

  // Clear previous diagnostics
  RvmDiagnostics.clear();

  try {
    if (input.kind === 'bundle') {
      return await ctx.staticBundleLoader.load(input.bundle, ctx, asyncSession);
    }

    if (input.kind === 'aveva-json') {
      const loader = new AvevaJsonLoader();
      return await loader.load(input.data, ctx, asyncSession);
    }

    if (input.kind === 'raw-rvm') {
      if (!capabilities?.rawRvmImport) {
        throw new Error('Raw RVM import unavailable in static mode. Load a converted bundle instead.');
      }
      return await ctx.assistedBridge.convertAndLoad(input, ctx, asyncSession);
    }

    throw new Error('Unsupported RVM source.');
  } catch (err) {
    asyncSession.fail(err.message);
    RvmDiagnostics.report('error', 'Load failed', err.message);
    emit(RuntimeEvents.RENDER_ERROR, { source: 'rvm-load-pipeline', message: err.message });
    throw err;
  }
}
