// A profile is an opt-in: a spec sets profile: <name> and gains a typed map of extra content
// (writing: for profile: writing) that this file's rules check, on top of everything the core
// format already requires. Every profile finding still reports under one of the nine tests; a
// profile adds no tenth test and no separate score.
//
// This is the one place that knows which profile names exist. Adding a profile means adding one
// entry here; rules.mjs and score.mjs both go through this registry rather than naming "writing"
// themselves, so a second profile needs no change to either.
import { lintWriting, blockStatus } from "./writing.mjs";

const str = (v) => (typeof v === "string" ? v.trim() : "");
const f = (test, id, severity, message, fix) => ({ test, id, severity, message, fix });

export const PROFILES = Object.freeze({
  writing: Object.freeze({
    lint: lintWriting,
    // Block completeness for the CLI's "<name>: k/n blocks complete" line and its --json twin.
    // Reads the same findings lint just produced, so the count and the findings can never
    // disagree with each other.
    status: (data, findings) => blockStatus(data, findings),
  }),
});

// Own-property lookup only: a profile named after something every object inherits
// (constructor, toString, __proto__) is an unknown profile, never a function to call.
export const knownProfile = (name) => (Object.hasOwn(PROFILES, name) ? PROFILES[name] : undefined);

// Runs the declared profile's rules against a loaded spec. A spec with no profile: at all runs no
// profile rules, so an unprofiled spec lints exactly as it always has. A profile: this linter does
// not know is a warning under test 7 (a stranger resuming the spec still needs to know its rules
// were not checked), not a failure: an unknown profile is not necessarily a wrong one, only one
// this version cannot yet check.
export function lintProfile(spec) {
  const name = str(spec?.data?.profile);
  if (!name) return [];
  const profile = knownProfile(name);
  if (!profile) {
    return [f(7, "unknown-profile", "warn", `this linter does not know profile "${name}"; its rules were not checked`, "Set profile: to one this linter knows (writing), or remove it.")];
  }
  return profile.lint(spec);
}

// The { name, complete, total } score.mjs merges into a passing profile's score, or undefined
// when no profile ran or the declared one is unknown (nothing to count).
export function profileStatus(data, findings) {
  const name = str(data?.profile);
  const profile = knownProfile(name);
  if (!profile) return undefined;
  return { name, ...profile.status(data, findings) };
}
