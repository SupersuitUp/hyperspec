// The closed vocabulary every segment of a marked material is labeled from (hyperspec 0.4). It lives in
// this leaf module, which imports nothing, so src/segments.mjs can read it without importing
// src/writing.mjs: writing.mjs imports writing-fields.mjs, which imports segments.mjs, and reading
// the labels through writing.mjs made that a cycle. writing.mjs re-exports it for callers that
// already import it from there.
export const MATERIAL_LABELS = Object.freeze(["claim", "story", "quote", "stance", "question", "aside", "private"]);
