const INITIALIZATION_KEY = Symbol.for("neopianAssistant.initialized");

export function claimInitialization(target = globalThis) {
  if (target[INITIALIZATION_KEY] === true) return false;
  Object.defineProperty(target, INITIALIZATION_KEY, {
    configurable: true,
    enumerable: false,
    value: true,
    writable: true,
  });
  return true;
}

export function releaseInitialization(target = globalThis) {
  if (target[INITIALIZATION_KEY] === true) target[INITIALIZATION_KEY] = false;
}
