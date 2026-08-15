export async function fetchWithDeadline({
  fetchImplementation,
  url,
  options,
  timeoutMs,
  controller,
}) {
  if (typeof fetchImplementation !== "function")
    throw new TypeError("A fetch implementation is required.");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1)
    throw new TypeError("A positive timeout is required.");
  const activeController = controller ?? new AbortController();
  const timeout = setTimeout(() => activeController.abort("timeout"), timeoutMs);
  try {
    return await fetchImplementation(url, { ...options, signal: activeController.signal });
  } finally {
    clearTimeout(timeout);
  }
}
