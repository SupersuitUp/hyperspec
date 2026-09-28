#!/usr/bin/env node
import { existsSync, writeFileSync } from "node:fs";
import { loadSpec } from "../src/load.mjs";
import { lintSpec } from "../src/rules.mjs";
import { score, exitCode } from "../src/score.mjs";
import { template } from "../src/template.mjs";

const HELP = `hyperspec <command> [options]

  lint <file...> [--json]      score each hyperspec against the nine tests
                               exit 0 pass, 1 a test fails, 3 blocked on an open decision, 2 usage
  init <file> [--title T] [--kind K]   write a new hyperspec skeleton (refuses to overwrite)

Spec: SPEC.md`;

const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const cmd = argv[0];

if (!cmd || cmd === "--help" || cmd === "-h") { console.log(HELP); process.exit(cmd ? 0 : 2); }

if (cmd === "init") {
  const file = argv[1];
  if (!file || file.startsWith("--")) { console.error("init needs a file path"); process.exit(2); }
  if (existsSync(file)) { console.error(`refusing to overwrite ${file}`); process.exit(2); }
  writeFileSync(file, template({ title: flag("--title"), kind: flag("--kind") }));
  console.log(`wrote ${file}; run: hyperspec lint ${file}`);
  process.exit(0);
}

if (cmd === "lint") {
  const json = argv.includes("--json");
  // Lint takes one flag, --json, and no flag takes a value, so a flag is dropped on its own and
  // never takes the argument after it (a stray --kind before the files must not swallow one).
  const files = argv.slice(1).filter((a) => !a.startsWith("--"));
  if (!files.length) { console.error("lint needs at least one file"); process.exit(2); }
  const rank = { 2: 4, 1: 3, 3: 2, 0: 1 };
  let worst = 0;
  const reports = files.map((file) => {
    const spec = loadSpec(file);
    if (spec.error) { worst = 2; return { file, status: "error", error: spec.error }; }
    // A crash on one file is reported as that file's error; it never aborts the others or empties --json.
    let findings, s;
    try { findings = lintSpec(spec); s = score(findings, spec.data); }
    catch (e) { worst = 2; return { file, status: "error", error: `lint crashed: ${e.message}` }; }
    const code = exitCode(s.status);
    if (rank[code] > rank[worst]) worst = code;
    return { file, ...s, findings };
  });
  if (json) console.log(JSON.stringify({ files: reports }, null, 2));
  else for (const r of reports) {
    if (r.error) { console.log(`${r.file}: ${r.error}`); continue; }
    console.log(`${r.file}: ${r.status} (${r.passed}/9)${r.open.length ? `, open: ${r.open.join(", ")}` : ""}`);
    for (const t of r.tests) if (!t.pass) console.log(`  ✗ ${t.n}. ${t.name}`);
    for (const f of r.findings) console.log(`    ${f.severity === "fail" ? "fail" : "warn"} [${f.test}] ${f.message}\n         fix: ${f.fix}`);
  }
  process.exit(worst);
}

console.error(`unknown command: ${cmd}\n\n${HELP}`);
process.exit(2);
