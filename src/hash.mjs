import { createHash } from "node:crypto";

// SHA-256, lowercase hex, over exact bytes. Accepts a Buffer or a string.
export function sha256(bufferOrString) {
  return createHash("sha256").update(bufferOrString).digest("hex");
}

// Canonical JSON for anything about to be hashed: keys sorted recursively,
// no whitespace, undefined keys dropped. Array order is preserved, since
// order is meaningful there (inputs, stages, reads).
export function canonical(value) {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] === undefined) continue;
      out[key] = sortKeys(value[key]);
    }
    return out;
  }
  return value;
}
