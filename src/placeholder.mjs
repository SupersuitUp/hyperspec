// A value only a human or an agent would recognize as "not actually written yet" never counts as
// present, wherever a presence check reads it: null / ~ (the YAML reader hands these back as the
// literal strings "null" and "~" rather than resolving them to YAML's own null), and the common
// placeholder words a scaffold leaves behind (todo, tbd, fixme, xxx, placeholder, <placeholder>).
// Matched only against the WHOLE trimmed value, case-insensitive: "TODO: write the opening" is
// real text that happens to start with the word, and still counts as present. Only a field whose
// value IS the bare word, and nothing else, is blank.
//
// This is the one place this pattern is defined. src/rules.mjs (the core tests), src/writing.mjs
// and src/writing-fields.mjs (the writing profile) all import str() from here rather than keeping
// their own copy, so a placeholder word added to the vocabulary closes every presence check in
// the linter at once, not just whichever file someone happened to be editing when they hit it.
// Fix round 1, Task 4 (R6): `hyperspec init --profile writing --fiction`'s character skeleton
// filled every required field with the bare string "TODO" and linted completely clean, because
// nothing before this file treated "TODO" as a placeholder the way it already treated null/~.
export const PLACEHOLDER = /^(null|~|todo|tbd|fixme|xxx|<placeholder>|placeholder)$/is;
export const str = (v) => { const t = typeof v === "string" ? v.trim() : ""; return PLACEHOLDER.test(t) ? "" : t; };
