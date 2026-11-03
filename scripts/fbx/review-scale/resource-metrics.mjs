import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

async function pathSize(path) {
  try {
    const info = await stat(path);
    if (info.isFile()) return info.size;
    if (!info.isDirectory()) return 0;
    let total = 0;
    for (const entry of await readdir(path)) total += await pathSize(join(path, entry));
    return total;
  } catch (error) {
    if (error.code === 'ENOENT') return 0;
    throw error;
  }
}

export async function directoryBytes(path) {
  return pathSize(path);
}

async function procIo() {
  try {
    const text = await readFile('/proc/self/io', 'utf8');
    return Object.fromEntries(text.trim().split('\n').map((line) => {
      const [key, value] = line.split(':');
      return [key.trim(), Number.parseInt(value.trim(), 10)];
    }));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function fileDescriptorCount() {
  try { return (await readdir('/proc/self/fd')).length; }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function ioDelta(before, after, key) {
  if (!before || !after) return null;
  return Math.max(0, (after[key] || 0) - (before[key] || 0));
}

async function sampleMemory(state) {
  const memory = process.memoryUsage();
  state.peaks.rss = Math.max(state.peaks.rss, memory.rss);
  state.peaks.heap = Math.max(state.peaks.heap, memory.heapUsed);
  const fds = await fileDescriptorCount();
  if (fds !== null) state.peaks.fds = Math.max(state.peaks.fds, fds);
}

async function sampleDisk(state) {
  state.peaks.disk = Math.max(state.peaks.disk, await pathSize(state.monitorRoot));
}

function resourceResult(state, endingIo) {
  const cpu = process.cpuUsage(state.startingCpu);
  const maxRss = process.resourceUsage().maxRSS * 1024;
  return {
    wallMs: Number(process.hrtime.bigint() - state.started) / 1e6,
    cpuUserMs: cpu.user / 1000,
    cpuSystemMs: cpu.system / 1000,
    peakRssBytes: Math.max(state.peaks.rss, maxRss),
    peakHeapBytes: state.peaks.heap,
    temporaryDiskPeakBytes: Math.max(0, state.peaks.disk - state.baselineDisk),
    bytesRead: ioDelta(state.startingIo, endingIo, 'read_bytes'),
    bytesWritten: ioDelta(state.startingIo, endingIo, 'write_bytes'),
    fileDescriptorPeak: state.peaks.fds || null,
  };
}

function scheduleSampler(state, key, intervalMs, sampler) {
  const timer = setInterval(() => {
    if (!state.active || state[key]) return;
    state[key] = sampler(state).finally(() => { state[key] = null; });
  }, intervalMs);
  timer.unref();
  return timer;
}

async function stopSampling(state) {
  state.active = false;
  for (const timer of state.timers) clearInterval(timer);
  await Promise.all([state.memoryPending, state.diskPending].filter(Boolean));
  await Promise.all([sampleMemory(state), sampleDisk(state)]);
}

export async function startResourceSampler(monitorRoot, options = {}) {
  const memoryIntervalMs = options.memoryIntervalMs || 100;
  const diskIntervalMs = options.diskIntervalMs || 2000;
  const baselineDisk = await pathSize(monitorRoot);
  const state = {
    monitorRoot, baselineDisk, startingIo: await procIo(),
    startingCpu: process.cpuUsage(), started: process.hrtime.bigint(),
    peaks: { rss: 0, heap: 0, disk: baselineDisk, fds: 0 },
    active: true, memoryPending: null, diskPending: null, timers: [],
  };
  state.timers = [
    scheduleSampler(state, 'memoryPending', memoryIntervalMs, sampleMemory),
    scheduleSampler(state, 'diskPending', diskIntervalMs, sampleDisk),
  ];
  await Promise.all([sampleMemory(state), sampleDisk(state)]);
  return async function stop() {
    await stopSampling(state);
    return resourceResult(state, await procIo());
  };
}
