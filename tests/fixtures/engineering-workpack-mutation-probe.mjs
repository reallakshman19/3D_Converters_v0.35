export function attemptWorkpackMutation({ workpack }) {
  const authorityBefore = workpack.authority.state;
  const lifecycleBefore = workpack.capabilityLifecycle.state;
  try {
    workpack.authority.state = 'PROMOTED';
    workpack.capabilityLifecycle.state = 'ACTIVE';
  } catch {
    // Expected for a deeply frozen work pack.
  }
  const unchanged = workpack.authority.state === authorityBefore
    && workpack.capabilityLifecycle.state === lifecycleBefore;
  return { ok: unchanged, detail: unchanged ? 'work pack remained immutable' : 'work pack mutation succeeded' };
}
