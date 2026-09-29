import { TESTS } from "./rules.mjs";
import { profileStatus } from "./profiles.mjs";

export function score(findings, data = {}) {
  const failed = new Set(findings.filter((x) => x.severity === "fail").map((x) => x.test));
  const tests = TESTS.map((t) => ({ n: t.n, name: t.name, pass: !failed.has(t.n) }));
  const open = (Array.isArray(data.decisions) ? data.decisions : [])
    .filter((x) => String(x?.state || "").trim() === "open").map((x) => String(x.id || "").trim());
  const status = failed.size ? "fail" : open.length ? "blocked" : "pass";
  const out = { tests, passed: tests.filter((t) => t.pass).length, open, status };
  // Only when a known profile ran: profileStatus returns undefined for no profile: at all, and
  // for one this linter does not know (nothing to count when its rules were never checked).
  const profile = profileStatus(data, findings);
  if (profile) out.profile = profile;
  return out;
}

export const exitCode = (status) => ({ pass: 0, fail: 1, blocked: 3 })[status] ?? 2;
