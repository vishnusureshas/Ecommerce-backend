/**
 * Return a new object containing only the allowlisted keys present in `obj`.
 * Used for safe profile updates / query parsing (mass-assignment guard).
 */
export function pick(obj, keys = []) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined) {
      out[key] = obj[key];
    }
  }
  return out;
}
