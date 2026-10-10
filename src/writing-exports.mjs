// @supersuit/hyperspec/writing: the reading side of the writing profile, for a tool outside this
// package. For materials marking (an agent, an editor, the writing engine's capture stage) it gets
// the closed label set and the same parse-and-validate the linter runs; labeling itself stays with
// whoever calls this. For scoped writer DNA it gets readScope, the same read of a scope folder
// (scope.md plus every golden, with their field findings) that `hyperspec lint` and
// `hyperspec dna measure` run, and measureFeatures, the pure function that turns golden passages
// into the numbers features.json records. Judging a draft against those numbers stays with the
// caller.
export { MATERIAL_LABELS } from "./labels.mjs";
export { readSegments } from "./segments.mjs";
export { readScope, measureFeatures } from "./dna.mjs";
// specText writes a spec's text from data and refuses anything the reader would not return
// unchanged, for a tool that builds specs (0.10).
export { specText, parseSpecText } from "./spec-text.mjs";
// loadSpec reads one spec the way every command does: parsed, and merged with its form when it
// names one (0.11), so a tool that drives the engine (superwrite's books) reads the outline, the
// front matter and the sequence files a work is really held to, without re-implementing the merge
// (0.12).
export { loadSpec } from "./load.mjs";
