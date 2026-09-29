// @supersuit/hyperspec/writing: the reading side of materials marking, for a tool outside this
// package that labels materials (an agent, an editor, the writing engine's capture stage). It gets
// the closed label set and the same parse-and-validate the linter runs; labeling itself stays with
// whoever calls this.
export { MATERIAL_LABELS } from "./labels.mjs";
export { readSegments } from "./segments.mjs";
