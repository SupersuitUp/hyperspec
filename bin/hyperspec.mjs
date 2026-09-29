#!/usr/bin/env node
import { existsSync, writeFileSync } from "node:fs";
import { loadSpec } from "../src/load.mjs";
import { lintSpec } from "../src/rules.mjs";
import { score, exitCode } from "../src/score.mjs";
import { template } from "../src/template.mjs";
import { writingTemplate } from "../src/writing-template.mjs";
import { PROFILES } from "../src/profiles.mjs";
import { readRecipe, checkRecipe } from "../src/recipe.mjs";
import { approve } from "../src/writer.mjs";
import { reproduce } from "../src/reproduce.mjs";
import { regenerate } from "../src/regenerate.mjs";
import { compare } from "../src/compare.mjs";

const HELP = `hyperspec <command> [options]

  lint <file...> [--json]      score each hyperspec against the nine tests
                               exit 0 pass, 1 a test fails, 3 blocked on an open decision, 2 usage
  init <file> [--title T] [--kind K]   write a new hyperspec skeleton (refuses to overwrite)
  init <file> --profile writing [--title T] [--form F] [--fiction]
                               write a writing-profile skeleton: every required block (materials,
                               dna, persona, audience, goal, form, spine, sources) shown in full
                               with placeholder values, dna/persona/audience/goal also carrying an
                               open decision naming the question only the operator can answer;
                               --fiction adds one character, same treatment; the skeleton never
                               passes until its placeholders and open decisions are replaced with
                               real content; exit 2 for a --profile this linter does not know

  recipe check <output-or-recipe> [--json]
                               check a recipe's completeness (a path not ending .recipe.json
                               means <path>.recipe.json)
                               exit 0 ok (warns only), 1 no recipe found or a check failed,
                               2 unreadable/invalid recipe JSON
  recipe approve <recipe> --by <slug> [--json]
                               set the recipe's approver, print remaining findings
                               exit 0 once --by and the recipe are valid, 2 missing --by or
                               unreadable recipe
  reproduce <recipe> [--restore] [--store d] [--json]
                               replay a recipe's hash checks against the blob store; never
                               runs a model
                               exit 0 reproduces cleanly, 1 a check failed, 2 unreadable recipe
  regenerate <recipe> --out <path> --clicker <slug>
             (--add-input n=p [--reads id]... | --swap-input n=p | --factory-version v)
             [--run cmd] [--change text] [--store d] [--json]
                               make a child recipe from a parent plus exactly one change
                               exit 0 ok, 1 a stage failed or the child has failing verdicts,
                               2 usage, 3 pending a runner
  compare <child-recipe> --doctor cmd [--parent r] [--spec s] [--json]
                               grade a child and its parent through one doctor against one spec
                               exit 0 not regressed, 1 regressed, 2 usage or unreadable input

Spec: SPEC.md`;

const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const cmd = argv[0];

if (!cmd || cmd === "--help" || cmd === "-h") { console.log(HELP); process.exit(cmd ? 0 : 2); }

// Each profile that wants its own init skeleton adds one entry here; a profile absent from this
// map still lints (via PROFILES in profiles.mjs) but init falls back to the plain template for it.
const PROFILE_TEMPLATES = { writing: writingTemplate };

if (cmd === "init") {
  const file = argv[1];
  if (!file || file.startsWith("--")) { console.error("init needs a file path"); process.exit(2); }
  if (existsSync(file)) { console.error(`refusing to overwrite ${file}`); process.exit(2); }
  const profileName = flag("--profile");
  if (profileName !== undefined && !(profileName in PROFILES)) {
    console.error(`unknown profile: ${profileName}; known profiles: ${Object.keys(PROFILES).join(", ") || "(none)"}`);
    process.exit(2);
  }
  const writeTemplate = profileName && PROFILE_TEMPLATES[profileName];
  const content = writeTemplate
    ? writeTemplate({ title: flag("--title"), form: flag("--form"), fiction: argv.includes("--fiction") })
    : template({ title: flag("--title"), kind: flag("--kind") });
  writeFileSync(file, content);
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
    if (r.profile) console.log(`  ${r.profile.name}: ${r.profile.complete}/${r.profile.total} blocks complete`);
    for (const t of r.tests) if (!t.pass) console.log(`  ✗ ${t.n}. ${t.name}`);
    for (const f of r.findings) console.log(`    ${f.severity === "fail" ? "fail" : "warn"} [${f.test}] ${f.message}\n         fix: ${f.fix}`);
  }
  process.exit(worst);
}

// Generic flag/positional parser for the recipe verbs below. A value-taking flag (valueFlags,
// repeatableFlags) never swallows a following --flag as its value (missing value is an error, not
// a silent grab); a bool flag never eats the next token as a positional; any --flag not declared
// for this verb is an error. This is the same discipline lint's own hand-rolled parser follows
// above (a stray flag never swallows a file), generalized once repeated-flag verbs (regenerate's
// --reads) and value flags (--out, --by, --doctor, ...) showed up.
function parseArgs(args, { valueFlags = [], boolFlags = [], repeatableFlags = [] } = {}) {
  const positionals = [];
  const values = {};
  for (const f of boolFlags) values[f] = false;
  for (const f of repeatableFlags) values[f] = [];
  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (a.startsWith("--")) {
      if (repeatableFlags.includes(a)) {
        const v = args[i + 1];
        if (v === undefined || v.startsWith("--")) return { error: `${a} needs a value` };
        values[a].push(v);
        i += 2;
        continue;
      }
      if (valueFlags.includes(a)) {
        const v = args[i + 1];
        if (v === undefined || v.startsWith("--")) return { error: `${a} needs a value` };
        values[a] = v;
        i += 2;
        continue;
      }
      if (boolFlags.includes(a)) { values[a] = true; i += 1; continue; }
      return { error: `unknown flag: ${a}` };
    }
    positionals.push(a);
    i += 1;
  }
  return { positionals, values };
}

// name=path, split on the FIRST =, so a path that itself contains = survives intact. A value with
// no = is a usage error (exit 2).
function namePath(flagName, raw) {
  const eq = raw.indexOf("=");
  if (eq === -1) { console.error(`${flagName} needs name=path`); process.exit(2); }
  return { name: raw.slice(0, eq), path: raw.slice(eq + 1) };
}

function printFindings(findings) {
  if (!findings.length) { console.log("ok"); return; }
  for (const f of findings) console.log(`${f.severity === "fail" ? "fail" : "warn"} [${f.field}] ${f.message}`);
}

function printPlan(plan) {
  for (const p of plan ?? []) console.log(`  ${p.id}: ${p.action}${p.reason ? ` (${p.reason})` : ""}`);
}

if (cmd === "recipe") {
  const sub = argv[1];

  if (sub === "check") {
    const parsed = parseArgs(argv.slice(2), { boolFlags: ["--json"] });
    if (parsed.error) { console.error(parsed.error); process.exit(2); }
    const [target] = parsed.positionals;
    const json = parsed.values["--json"];
    if (!target) { console.error("recipe check needs a recipe or output path"); process.exit(2); }
    const recipePath = target.endsWith(".recipe.json") ? target : `${target}.recipe.json`;

    if (!existsSync(recipePath)) {
      const msg = `no recipe beside ${target}`;
      if (json) console.log(JSON.stringify({ recipe: recipePath, error: msg }, null, 2));
      else console.error(msg);
      process.exit(1);
    }

    const loaded = readRecipe(recipePath);
    if (loaded.error) {
      if (json) console.log(JSON.stringify({ recipe: recipePath, error: loaded.error }, null, 2));
      else console.error(loaded.error);
      process.exit(2);
    }

    const findings = checkRecipe(loaded.data);
    const hasFail = findings.some((f) => f.severity === "fail");
    if (json) console.log(JSON.stringify({ recipe: recipePath, findings }, null, 2));
    else { console.log(`${recipePath}:`); printFindings(findings); }
    process.exit(hasFail ? 1 : 0);
  }

  if (sub === "approve") {
    const parsed = parseArgs(argv.slice(2), { valueFlags: ["--by"], boolFlags: ["--json"] });
    if (parsed.error) { console.error(parsed.error); process.exit(2); }
    const [recipePath] = parsed.positionals;
    const json = parsed.values["--json"];
    if (!recipePath) { console.error("recipe approve needs a recipe path"); process.exit(2); }
    if (!parsed.values["--by"]) { console.error("recipe approve needs --by <slug>"); process.exit(2); }

    let findings;
    try {
      findings = approve(recipePath, parsed.values["--by"]);
    } catch (e) {
      if (json) console.log(JSON.stringify({ recipe: recipePath, error: e.message }, null, 2));
      else console.error(e.message);
      process.exit(2);
    }

    if (json) console.log(JSON.stringify({ recipe: recipePath, approver: parsed.values["--by"], findings }, null, 2));
    else { console.log(`${recipePath}: approver set to ${parsed.values["--by"]}`); printFindings(findings); }
    process.exit(0);
  }

  console.error(`unknown recipe subcommand: ${sub}\n\n${HELP}`);
  process.exit(2);
}

if (cmd === "reproduce") {
  const parsed = parseArgs(argv.slice(1), { valueFlags: ["--store"], boolFlags: ["--restore", "--json"] });
  if (parsed.error) { console.error(parsed.error); process.exit(2); }
  const [recipePath] = parsed.positionals;
  const json = parsed.values["--json"];
  if (!recipePath) { console.error("reproduce needs a recipe path"); process.exit(2); }

  const result = reproduce(recipePath, { store: parsed.values["--store"], restore: parsed.values["--restore"] });
  if (json) console.log(JSON.stringify(result, null, 2));

  if (result.error) {
    if (!json) console.error(result.error);
    process.exit(2);
  }
  if (!result.ok) {
    if (!json) {
      console.error(`first mismatch: ${result.firstMismatch}`);
      for (const step of result.steps) console.log(`  ${step.ok ? "ok  " : "FAIL"} ${step.ref}${step.why ? `: ${step.why}` : ""}`);
      if (result.restored) console.log("restored the output file from its blob");
    }
    process.exit(1);
  }
  if (!json) {
    for (const step of result.steps) console.log(`  ok   ${step.ref}`);
    if (result.restored) console.log("restored the output file from its blob");
    console.log("reproduces cleanly");
  }
  process.exit(0);
}

if (cmd === "regenerate") {
  const parsed = parseArgs(argv.slice(1), {
    valueFlags: ["--out", "--clicker", "--add-input", "--swap-input", "--factory-version", "--run", "--change", "--store"],
    boolFlags: ["--json"],
    repeatableFlags: ["--reads"],
  });
  if (parsed.error) { console.error(parsed.error); process.exit(2); }
  const [recipePath] = parsed.positionals;
  const json = parsed.values["--json"];
  if (!recipePath) { console.error("regenerate needs a parent recipe path"); process.exit(2); }
  if (parsed.values["--reads"].length && parsed.values["--add-input"] === undefined) {
    console.error("--reads is only valid with --add-input");
    process.exit(2);
  }

  const change = {};
  if (parsed.values["--add-input"] !== undefined) {
    const pair = namePath("--add-input", parsed.values["--add-input"]);
    change.addInput = { ...pair, reads: parsed.values["--reads"] };
  }
  if (parsed.values["--swap-input"] !== undefined) {
    change.swapInput = namePath("--swap-input", parsed.values["--swap-input"]);
  }
  if (parsed.values["--factory-version"] !== undefined) change.factoryVersion = parsed.values["--factory-version"];

  const result = regenerate(recipePath, {
    out: parsed.values["--out"],
    clicker: parsed.values["--clicker"],
    change,
    run: parsed.values["--run"],
    changeText: parsed.values["--change"],
    store: parsed.values["--store"],
  });
  if (json) console.log(JSON.stringify(result, null, 2));

  if (result.usage) {
    if (!json) console.error(result.error);
    process.exit(2);
  }
  if (!result.ok) {
    if (!json) {
      console.error(result.failedStage ? `stage ${result.failedStage} failed: ${result.error}` : result.error);
      if (result.plan?.length) printPlan(result.plan);
    }
    process.exit(1);
  }
  if (result.pending) {
    if (!json) {
      const waiting = result.plan.filter((p) => p.action === "rerun").map((p) => p.id);
      console.log(`pending; stages waiting for a runner: ${waiting.join(", ") || "(none)"}`);
      printPlan(result.plan);
      console.log(`child recipe: ${result.childRecipe}`);
      console.log("a pending child cannot be finished in place yet; to produce the output, rerun regenerate on the parent with --run <command> and a new --out");
    }
    process.exit(3);
  }
  if (result.failedVerdicts?.length) {
    if (!json) {
      console.log(`child written despite failing verdict(s): ${result.failedVerdicts.join(", ")}`);
      printPlan(result.plan);
      console.log(`child recipe: ${result.childRecipe}`);
      console.log(`output: ${result.output}`);
    }
    process.exit(1);
  }
  if (!json) {
    printPlan(result.plan);
    console.log(`child recipe: ${result.childRecipe}`);
    console.log(`output: ${result.output}`);
  }
  process.exit(0);
}

if (cmd === "compare") {
  const parsed = parseArgs(argv.slice(1), { valueFlags: ["--doctor", "--parent", "--spec"], boolFlags: ["--json"] });
  if (parsed.error) { console.error(parsed.error); process.exit(2); }
  const [childRecipePath] = parsed.positionals;
  const json = parsed.values["--json"];
  if (!childRecipePath) { console.error("compare needs a child recipe path"); process.exit(2); }

  const result = compare(childRecipePath, {
    doctor: parsed.values["--doctor"],
    parent: parsed.values["--parent"],
    spec: parsed.values["--spec"],
  });
  if (json) console.log(JSON.stringify(result, null, 2));

  // Both a usage error and a check-failed error (missing output, escaping path, ...) map to
  // 2 here — compare's own ok:false without a usage flag is still "could not grade", i.e. an
  // unreadable-input class failure, not a graded-but-worse-1 class one.
  if (!result.ok) {
    if (!json) console.error(result.error);
    process.exit(2);
  }
  if (!json) {
    for (const w of result.warnings) console.log(`warn: ${w}`);
    if (result.ledger) console.log(`ledger: ${result.ledger}`);
  }
  if (result.regressed) {
    if (!json) console.log(`regression: child scored ${result.child.score} vs parent ${result.parent.score}; suspect: ${result.suspect ?? "unknown"}`);
    process.exit(1);
  }
  if (!json) console.log(`child scored ${result.child.score} vs parent ${result.parent.score} (delta ${result.delta})`);
  process.exit(0);
}

console.error(`unknown command: ${cmd}\n\n${HELP}`);
process.exit(2);
