/**
 * event-bus.js — Minimal pub/sub for inter-module communication.
 */
import { assertRuntimeEvent } from '../contracts/runtime-events.js';

const listeners = new Map();

export function on(event, fn) {
  assertRuntimeEvent(event);
  if (typeof fn !== 'function') {
    throw new TypeError(`Runtime event listener must be a function for event: ${event}`);
  }
  const list = listeners.get(event) || [];
  list.push(fn);
  listeners.set(event, list);

  return () => off(event, fn);
}

export function off(event, fn) {
  assertRuntimeEvent(event);
  const list = listeners.get(event);
  if (!list) return;
  const next = list.filter((listener) => listener !== fn);
  if (next.length) listeners.set(event, next);
  else listeners.delete(event);
}

export function emit(event, payload) {
  try {
    assertRuntimeEvent(event);
  } catch (error) {
    console.error('[event-bus] blocked unregistered runtime event', { event, payload, error });
    return false;
  }

  const list = [...(listeners.get(event) || [])];
  let ok = true;
  for (const fn of list) {
    try {
      fn(payload);
    } catch (error) {
      ok = false;
      console.error(`[event-bus] listener failed for ${event}`, error);
    }
  }
  return ok;
}
