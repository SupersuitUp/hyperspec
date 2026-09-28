import { TESTS } from "./rules.mjs";

export function score(findings, data = {}) {
  const failed = new Set(findings.filter((x) => x.severity === "fail").map((x) => x.test));
  const tests = TESTS.map((t) => ({ n: t.n, name: t.name, pass: !failed.has(t.n) }));
  const open = (Array.isArray(data.decisions) ? data.decisions : [])
    .filter((x) => String(x?.state || "").trim() === "open").map((x) => String(x.id || "").trim());
  const status = failed.size ? "fail" : open.length ? "blocked" : "pass";
  return { tests, passed: tests.filter((t) => t.pass).length, open, status };
}

export const exitCode = (status) => ({ pass: 0, fail: 1, blocked: 3 })[status] ?? 2;
