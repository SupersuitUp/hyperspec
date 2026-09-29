// A value only a human or an agent would recognize as "not actually written yet" never counts as
// present, wherever a presence check reads it:
//
// - null and ~ (the YAML reader hands these back as the literal strings "null" and "~" rather
//   than resolving them to YAML's own null);
// - the placeholder words a scaffold or a hurried author leaves behind: todo, tbd, fixme, xxx,
//   placeholder, <placeholder>, n/a;
// - a run of dashes, a run of question marks, or an ellipsis ("...", or the single character);
// - any of those followed by trailing ".", ":" or "!" (TODO., tbd:, FIXME!).
//
// Matched only against the WHOLE trimmed value, case-insensitive: "TODO: write the opening" is
// real text that happens to start with the word, and still counts as present. "none" is not on
// the list, because it is a legitimate decided value ("rejects: none of the above").
//
// This is the one place this pattern is defined. src/rules.mjs (the core tests), src/writing.mjs
// and src/writing-fields.mjs (the writing profile) all import str() from here rather than keeping
// their own copy, so a word added here closes every presence check in the linter at once. The
// rule exists because a scaffold that fills every field with "TODO" would otherwise lint clean.
export const PLACEHOLDER = /^(?:null|~|(?:todo|tbd|fixme|xxx|placeholder|<placeholder>|n\/a|-+|\?+|\.\.\.|…)[.:!]*)$/is;
export const str = (v) => { const t = typeof v === "string" ? v.trim() : ""; return PLACEHOLDER.test(t) ? "" : t; };
