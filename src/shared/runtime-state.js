import { isPlainObject } from "./validation.js";

export function collectExpiredRuntimeKeys(records, prefixes, now = Date.now()) {
  if (!isPlainObject(records) || !Array.isArray(prefixes) || !Number.isSafeInteger(now)) return [];
  const allowedPrefixes = prefixes.filter(
    (prefix) => typeof prefix === "string" && prefix.length > 0,
  );
  if (allowedPrefixes.length === 0) return [];
  return Object.entries(records)
    .filter(
      ([key, value]) =>
        allowedPrefixes.some((prefix) => key.startsWith(prefix)) &&
        (!isPlainObject(value) || !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= now),
    )
    .map(([key]) => key);
}
