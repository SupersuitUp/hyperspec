#!/usr/bin/env node
import { existsSync, statSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { loadSpec } from "../src/load.mjs";
import { lintSpec } from "../src/rules.mjs";
import { score, exitCode } from "../src/score.mjs";
import { template } from "../src/template.mjs";
import { writingTemplate } from "../src/writing-template.mjs";
import { PROFILES, knownProfile } from "../src/profiles.mjs";
import { readRecipe, checkRecipe } from "../src/recipe.mjs";
import { approve } from "../src/writer.mjs";
import { reproduce } from "../src/reproduce.mjs";
import { regenerate } from "../src/regenerate.mjs";
import { compare } from "../src/compare.mjs";
import { splitSegments } from "../src/segments.mjs";
import { sha256 } from "../src/hash.mjs";
import { readScope, measureFeatures, writeFeatures, scopeTemplate, GOLDENS_README } from "../src/dna.mjs";
import { str } from "../src/placeholder.mjs";
import { runCheck } from "../src/check.mjs";
import { prepareJudges, recordJudgment } from "../src/judge.mjs";
import { prepareLearn, recordLearn } from "../src/learn.mjs";

const HELP = `hyperspec <command> [options]

  lint <file...> [--json]      score each hyperspec against the nine tests
                               exit 0 pass, 1 a test fails, 3 blocked on an open decision, 2 usage
  check <spec> --draft <file> [--json] [--only a,b]
                               needs a writing spec (profile: writing); lints it first (a spec
                               that does not pass lint, or is blocked, exits with lint's own code
                               and runs no station: a draft cannot be checked against a spec that
                               is not ready); then runs every deterministic station (or the
                               --only subset, by name) against the draft, printing pass, fail
                               (with findings) or skip (with a reason) per station; appends one
                               line to the spec's improvement.ledger with a verdict: one-shot,
                               improved, or not-improved with a reason (an --only run is partial:
                               not-improved, and ignored by later verdicts)
                               exit 0 every run station passed, 1 a station failed, 2 usage
                               (including a missing draft file, a spec without the writing
                               profile, or an --only that names no known station)
  judge prepare <spec> --draft <file> --out <dir> [--only a,b] [--force] [--json]
                               needs a writing spec that passes lint (exits with lint's own code
                               otherwise); writes one <station>.packet.json per applicable
                               judgment station (or the --only subset) into <dir>: the rubric from
                               the spec, fixed instructions, the inputs and the exact verdict
                               shape, for an outside judge to fill; hyperspec never calls a model;
                               stations: doctor, lineup (a blind voice lineup against the DNA
                               scope's goldens, whose answer goes to lineup.key.json for a person
                               to read; record rebuilds it and never reads the file), reader,
                               persona (against the claims ledger), and for fiction attribution (a
                               blind speaker test on the dialogue lines whose speaker the draft
                               names; the answers go to attribution.key.json, likewise rebuilt)
                               and knowledge (each character's knowledge timeline);
                               the same spec and draft give byte-identical packets; refuses to
                               overwrite an existing packet without --force
                               exit 0 written, 2 usage (a missing or non-folder --out, an existing
                               packet without --force, an unknown --only name)
  judge record <packet> --verdict <file> [--json]
                               validate the judge's verdict against its packet (every evidence
                               span must appear in the draft; a draft or spec changed since the
                               packet is stale), derive the station's status, and append one line
                               to the spec's improvement.ledger, as check does; an invalid or stale
                               verdict appends nothing; run it from the folder prepare ran in, since
                               the packet keeps the spec and draft paths as they were given
                               exit 0 the station passed, 1 it failed or the verdict is invalid
                               or stale, 2 usage
  learn prepare <spec> --first <draft> --approved <draft> --out <dir> [--force] [--json]
                               needs a writing spec that passes lint (exits with lint's own code
                               otherwise); diffs the first draft a factory produced against the
                               draft a person approved, sentence by sentence, and writes
                               <dir>/learn.packet.json: each edit as a hunk (E1..En: deleted,
                               inserted or replaced, with both texts), the spec's block names plus
                               none, fixed instructions and the verdict shape, for an outside judge
                               to name the block that should have prevented each edit; the same
                               files give a byte-identical packet; refuses to overwrite it without
                               --force
                               exit 0 written, 2 usage
  learn record <packet> --verdict <file> [--json]
                               rebuild the packet from the files on disk (a changed file is stale,
                               an edited packet is refused), validate the verdict (every hunk id
                               exactly once, a block the spec has or none, a why), print the edits
                               per block and one next move for the block with the most, and append
                               one learn line to the spec's improvement.ledger (not-improved: the
                               spec has not changed yet); learn never edits the spec
                               exit 0 recorded, 1 the verdict is invalid or stale (nothing
                               appended), 2 usage
  init <file> [--title T] [--kind K]   write a new hyperspec skeleton (refuses to overwrite)
  init <file> --profile writing [--title T] [--form F] [--fiction]
                               write a writing-profile skeleton: every required block (materials,
                               dna, persona, audience, goal, form, spine, sources) shown in full
                               with placeholder values, dna/persona/audience/goal also carrying an
                               open decision naming the question only the operator can answer;
                               --fiction adds one character, same treatment; the skeleton never
                               passes until its placeholders and open decisions are replaced with
                               real content; exit 2 for a --profile with no value or one this
                               linter does not know, --fiction or --form without --profile
                               writing, --kind with it (use --form), or a folder that does not
                               exist

  segments init <material> --id <mid> [--out <file>] [--by paragraph|sentence]
                               split a material into candidate segments, written as JSONL to
                               <material>.segments.jsonl by default; every segment starts label:
                               unlabeled, never valid in lint; label each one by hand (claim,
                               story, quote, stance, question, aside, private), then run hyperspec
                               lint on the spec; --by sentence also starts a segment at each list
                               item (-, *, +, 1. or 1) then a space); refuses to overwrite an
                               existing file (exit 2); exit 2 for a missing material, a material
                               with nothing in it, an --out folder that does not exist, or a --by
                               outside paragraph/sentence

  dna init <scope-dir> --writer W --form F --audience A --purpose P
                               write a new writer-DNA scope: scope.md (writer, form, audience,
                               purpose) and an empty goldens/ folder holding a README on the
                               golden file shape (why, approved_by, source, optional approved_on;
                               the body is the passage, verbatim); refuses to overwrite an
                               existing scope.md; exit 2 on a missing parent folder, a missing
                               flag, or a flag value that looks like a placeholder (todo, ..., a
                               bare -), never a stack trace
  dna measure <scope-dir> [--json]
                               read every golden in <scope-dir>/goldens/, check its required
                               fields, and write <scope-dir>/features.json: deterministic style
                               features measured from the goldens' text, never judged and never
                               run through a model
                               exit 0 wrote features.json, 1 a golden (or the scope itself) fails
                               a required-field check, so a hollow golden is never measured into
                               the DNA, 2 usage

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
  const usage = (msg) => { console.error(msg); process.exit(2); };
  const given = (name) => argv.includes(name);
  // A value flag with nothing after it, or another flag after it, has no value.
  const value = (name) => { const v = flag(name); return v === undefined || v.startsWith("--") ? undefined : v; };
  const profileName = value("--profile");
  if (given("--profile") && profileName === undefined) usage("--profile needs a value; known profiles: " + Object.keys(PROFILES).join(", "));
  if (profileName !== undefined && !knownProfile(profileName)) {
    usage(`unknown profile: ${profileName}; known profiles: ${Object.keys(PROFILES).join(", ") || "(none)"}`);
  }
  const writeTemplate = profileName !== undefined && Object.hasOwn(PROFILE_TEMPLATES, profileName) ? PROFILE_TEMPLATES[profileName] : undefined;
  // The writing flags mean nothing to the plain template, and --kind means nothing to the writing
  // one (its kind comes from --form); either would be silently dropped, so both are refused.
  if (!writeTemplate) {
    for (const f of ["--fiction", "--form"]) if (given(f)) usage(`${f} only applies with --profile writing`);
  } else if (given("--kind")) {
    usage("--kind does not apply with --profile writing; use --form, which sets kind and writing.form.name together");
  }
  if (given("--form") && value("--form") === undefined) usage("--form needs a value");
  const folder = dirname(resolve(file));
  if (!existsSync(folder) || !statSync(folder).isDirectory()) usage(`the folder ${dirname(file)} does not exist; create it first`);
  const content = writeTemplate
    ? writeTemplate({ title: flag("--title"), form: value("--form"), fiction: given("--fiction") })
    : template({ title: flag("--title"), kind: flag("--kind") });
  try { writeFileSync(file, content); }
  catch (e) { usage(`could not write ${file}: ${e.code === "EACCES" ? "permission denied" : e.message}`); }
  console.log(`wrote ${file}; run: hyperspec lint ${file}`);
  process.exit(0);
}

if (cmd === "segments") {
  const sub = argv[1];

  if (sub === "init") {
    const parsed = parseArgs(argv.slice(2), { valueFlags: ["--id", "--out", "--by"] });
    if (parsed.error) { console.error(parsed.error); process.exit(2); }
    const [material] = parsed.positionals;
    if (!material) { console.error("segments init needs a material path"); process.exit(2); }
    if (!parsed.values["--id"]) { console.error("segments init needs --id <material id>"); process.exit(2); }
    const id = parsed.values["--id"];
    const by = parsed.values["--by"] ?? "paragraph";
    if (by !== "paragraph" && by !== "sentence") { console.error(`--by must be paragraph or sentence, not "${by}"`); process.exit(2); }
    let materialStat;
    try { materialStat = statSync(material); } catch { materialStat = null; }
    if (!materialStat || !materialStat.isFile()) { console.error(`material not found: ${material}`); process.exit(2); }
    const out = parsed.values["--out"] ?? `${material}.segments.jsonl`;
    if (existsSync(out)) { console.error(`refusing to overwrite ${out}`); process.exit(2); }
    const outFolder = dirname(resolve(out));
    if (!existsSync(outFolder) || !statSync(outFolder).isDirectory()) { console.error(`folder does not exist: ${dirname(out)}; create it first`); process.exit(2); }

    const buf = readFileSync(material);
    const text = buf.toString("utf8");
    if (!/\S/.test(text)) { console.error(`nothing to mark: ${material} has no text`); process.exit(2); }
    const segments = splitSegments(text, { by });
    const header = { material: id, path: material, sha256: sha256(buf) };
    const lines = [JSON.stringify(header), ...segments.map((s) => JSON.stringify(s))];
    writeFileSync(out, `${lines.join("\n")}\n`);
    console.log(`${segments.length} segments written to ${out}. Label every segment (claim, story, quote, stance, question, aside, private), then run hyperspec lint on the spec.`);
    process.exit(0);
  }

  console.error(`unknown segments subcommand: ${sub}\n\n${HELP}`);
  process.exit(2);
}

if (cmd === "dna") {
  const sub = argv[1];

  if (sub === "init") {
    const parsed = parseArgs(argv.slice(2), { valueFlags: ["--writer", "--form", "--audience", "--purpose"] });
    if (parsed.error) { console.error(parsed.error); process.exit(2); }
    const [scopeDir] = parsed.positionals;
    if (!scopeDir) { console.error("dna init needs a scope-dir path"); process.exit(2); }
    for (const flagName of ["--writer", "--form", "--audience", "--purpose"]) {
      if (!parsed.values[flagName]) { console.error(`dna init needs ${flagName} <value>`); process.exit(2); }
    }
    // A placeholder-looking value (todo, tbd, ..., ???, ...) is caught here rather than left
    // for the next `dna measure` to catch on scope.md's own fields; str() is the one place that
    // pattern is defined (src/placeholder.mjs), reused rather than re-checked.
    for (const flagName of ["--writer", "--form", "--audience", "--purpose"]) {
      if (!str(parsed.values[flagName])) {
        console.error(`dna init ${flagName} "${parsed.values[flagName]}" looks like a placeholder; give it real content`);
        process.exit(2);
      }
    }
    const writer = parsed.values["--writer"];
    const form = parsed.values["--form"];
    const audience = parsed.values["--audience"];
    const purpose = parsed.values["--purpose"];

    const scopeAbs = resolve(scopeDir);
    const parent = dirname(scopeAbs);
    if (!existsSync(parent) || !statSync(parent).isDirectory()) {
      console.error(`the folder ${dirname(scopeDir)} does not exist; create it first`);
      process.exit(2);
    }
    if (existsSync(scopeAbs) && !statSync(scopeAbs).isDirectory()) {
      console.error(`${scopeDir} is not a directory`);
      process.exit(2);
    }
    // scopeMdPath (absolute, resolved from the cwd) is for filesystem operations only. Every
    // message uses scopeMdDisplay, built from scopeDir exactly as given (relative, if that is how
    // the operator typed it): a path the operator did not resolve themselves must never appear
    // resolved in output, the same rule every other finding in this linter already follows.
    const scopeMdPath = join(scopeAbs, "scope.md");
    const scopeMdDisplay = join(scopeDir, "scope.md");
    if (existsSync(scopeMdPath)) { console.error(`refusing to overwrite ${scopeMdDisplay}`); process.exit(2); }

    mkdirSync(join(scopeAbs, "goldens"), { recursive: true });
    writeFileSync(scopeMdPath, scopeTemplate({ writer, form, audience, purpose }));
    // An operator's own goldens/README.md is theirs: write the guidance only where none exists.
    try {
      writeFileSync(join(scopeAbs, "goldens", "README.md"), GOLDENS_README, { flag: "wx" });
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
    }
    console.log(`wrote ${scopeMdDisplay} and ${scopeDir}/goldens/. Add goldens, then run: hyperspec dna measure ${scopeDir}`);
    process.exit(0);
  }

  if (sub === "measure") {
    const parsed = parseArgs(argv.slice(2), { boolFlags: ["--json"] });
    if (parsed.error) { console.error(parsed.error); process.exit(2); }
    const [scopeDir] = parsed.positionals;
    if (!scopeDir) { console.error("dna measure needs a scope-dir path"); process.exit(2); }
    const json = parsed.values["--json"];

    const { scope, goldens, findings } = readScope(scopeDir);
    const hasFail = findings.some((x) => x.severity === "fail");
    if (hasFail) {
      if (json) console.log(JSON.stringify({ scope: scopeDir, findings }, null, 2));
      else for (const x of findings) console.log(`fail [${x.test}] ${x.message}\n  fix: ${x.fix}`);
      process.exit(1);
    }

    const features = measureFeatures(goldens.map((g) => g.text));
    const { path: featuresPath } = writeFeatures(scopeDir, { scope, goldens, features });
    if (json) {
      console.log(JSON.stringify({ scope: scopeDir, goldens: goldens.length, features, wrote: featuresPath }, null, 2));
    } else {
      console.log(`${scopeDir}: measured ${goldens.length} golden${goldens.length === 1 ? "" : "s"}`);
      console.log(`  word_count ${features.word_count}, sentence length mean ${features.sentence_length.mean} median ${features.sentence_length.median} p90 ${features.sentence_length.p90}`);
      console.log(`  signature words: ${features.signature_words.join(", ") || "(none)"}`);
      console.log(`wrote ${featuresPath}`);
    }
    process.exit(0);
  }

  console.error(`unknown dna subcommand: ${sub}\n\n${HELP}`);
  process.exit(2);
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

if (cmd === "check") {
  const parsed = parseArgs(argv.slice(1), { valueFlags: ["--draft", "--only"], boolFlags: ["--json"] });
  if (parsed.error) { console.error(parsed.error); process.exit(2); }
  const [specPath] = parsed.positionals;
  const json = parsed.values["--json"];
  // A usage error exits 2: a plain message on stderr, or under --json one document on stdout,
  // { spec, draft, error }, the way lint --json reports a file it could not read.
  const usage = (error) => {
    if (json) console.log(JSON.stringify({ spec: specPath ?? null, draft: parsed.values["--draft"] ?? null, error }, null, 2));
    else console.error(error);
    process.exit(2);
  };
  if (!specPath) usage("check needs a spec path");
  if (!parsed.values["--draft"]) usage("check needs --draft <file>");
  let only;
  if (parsed.values["--only"] !== undefined) {
    only = parsed.values["--only"].split(",").map((s) => s.trim()).filter(Boolean);
    if (!only.length) usage("--only names no station");
  }

  const result = runCheck(specPath, parsed.values["--draft"], { only });

  // Usage errors (an unreadable spec, a spec without the writing profile, an unknown --only name,
  // a missing draft file): exit 2, as above.
  if (result.usage) usage(result.error);

  if (result.lintBlocked) {
    if (json) console.log(JSON.stringify(result, null, 2));
    else {
      const r = result.lintScore;
      console.log(`${result.specPath}: ${r.status} (${r.passed}/9)${r.open.length ? `, open: ${r.open.join(", ")}` : ""}`);
      for (const t of r.tests) if (!t.pass) console.log(`  ✗ ${t.n}. ${t.name}`);
      for (const f of result.lintFindings) console.log(`    ${f.severity === "fail" ? "fail" : "warn"} [${f.test}] ${f.message}\n         fix: ${f.fix}`);
      console.log("no stations run: the spec is not ready (run `hyperspec lint` on it for details)");
    }
    process.exit(result.code);
  }

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    for (const s of result.stations) {
      if (s.status === "skip") { console.log(`${s.station}: skip (${s.reason})`); continue; }
      console.log(`${s.station}: ${s.status}`);
      for (const finding of s.findings) console.log(`  ${finding.severity === "fail" ? "fail" : "warn"} [${finding.id}] ${finding.message}${typeof finding.line === "number" ? ` (line ${finding.line})` : ""}\n    fix: ${finding.fix}`);
    }
    if (result.verdict) {
      const detail = result.verdictDetail.change ?? result.verdictDetail.reason;
      console.log(`verdict: ${result.verdict}${detail ? ` (${detail})` : ""}`);
    }
    if (result.ledgerWarning) console.log(`warn: ${result.ledgerWarning}`);
  }
  process.exit(result.code);
}

if (cmd === "judge") {
  const sub = argv[1];
  const printFinding = (f) => console.log(`  ${f.severity === "fail" ? "fail" : "warn"} [${f.id}] ${f.message}${typeof f.line === "number" ? ` (line ${f.line})` : ""}\n    fix: ${f.fix}`);

  if (sub === "prepare") {
    const parsed = parseArgs(argv.slice(2), { valueFlags: ["--draft", "--out", "--only"], boolFlags: ["--force", "--json"] });
    if (parsed.error) { console.error(parsed.error); process.exit(2); }
    const [specPath] = parsed.positionals;
    const json = parsed.values["--json"];
    const usage = (error) => {
      if (json) console.log(JSON.stringify({ spec: specPath ?? null, draft: parsed.values["--draft"] ?? null, out: parsed.values["--out"] ?? null, error }, null, 2));
      else console.error(error);
      process.exit(2);
    };
    if (!specPath) usage("judge prepare needs a spec path");
    if (!parsed.values["--draft"]) usage("judge prepare needs --draft <file>");
    if (!parsed.values["--out"]) usage("judge prepare needs --out <dir>");
    let only;
    if (parsed.values["--only"] !== undefined) {
      only = parsed.values["--only"].split(",").map((x) => x.trim()).filter(Boolean);
      if (!only.length) usage("--only names no judge");
    }
    const result = prepareJudges(specPath, parsed.values["--draft"], parsed.values["--out"], { only, force: parsed.values["--force"] });
    if (result.usage) usage(result.error);
    if (result.lintBlocked) printLintBlocked(result, json, "no packets written");
    if (json) console.log(JSON.stringify(result, null, 2));
    else {
      for (const w of result.written) console.log(w.path);
      for (const s of result.skipped) console.log(`${s.station}: skip (${s.reason})`);
      for (const f of result.crashed) { console.log(`${f.station}: no packet`); printFinding(f); }
    }
    process.exit(result.code);
  }

  if (sub === "record") {
    const parsed = parseArgs(argv.slice(2), { valueFlags: ["--verdict"], boolFlags: ["--json"] });
    if (parsed.error) { console.error(parsed.error); process.exit(2); }
    const [packetPath] = parsed.positionals;
    const json = parsed.values["--json"];
    const usage = (error) => {
      if (json) console.log(JSON.stringify({ packet: packetPath ?? null, verdict: parsed.values["--verdict"] ?? null, error }, null, 2));
      else console.error(error);
      process.exit(2);
    };
    if (!packetPath) usage("judge record needs a packet path");
    if (!parsed.values["--verdict"]) usage("judge record needs --verdict <file>");
    const result = recordJudgment(packetPath, parsed.values["--verdict"]);
    if (result.usage) usage(result.error);
    if (json) console.log(JSON.stringify(result, null, 2));
    else if (result.stale || result.invalid) {
      console.log(`${result.station}: ${result.stale ? "stale" : "invalid"} verdict, nothing recorded`);
      for (const f of result.findings) printFinding(f);
    } else {
      console.log(`${result.station}: ${result.status}`);
      if (result.summary) console.log(`  ${result.summary}`);
      for (const f of result.findings) printFinding(f);
      if (result.verdict) {
        const detail = result.verdictDetail.change ?? result.verdictDetail.reason;
        console.log(`verdict: ${result.verdict}${detail ? ` (${detail})` : ""}`);
      }
      if (result.ledgerWarning) console.log(`warn: ${result.ledgerWarning}`);
    }
    process.exit(result.code);
  }

  console.error(`unknown judge subcommand: ${sub ?? "(none)"}\n\n${HELP}`);
  process.exit(2);
}

if (cmd === "learn") {
  const sub = argv[1];
  const printFinding = (f) => console.log(`  ${f.severity === "fail" ? "fail" : "warn"} [${f.id}] ${f.message}\n    fix: ${f.fix}`);

  if (sub === "prepare") {
    const parsed = parseArgs(argv.slice(2), { valueFlags: ["--first", "--approved", "--out"], boolFlags: ["--force", "--json"] });
    if (parsed.error) { console.error(parsed.error); process.exit(2); }
    const [specPath] = parsed.positionals;
    const json = parsed.values["--json"];
    const opts = { first: parsed.values["--first"], approved: parsed.values["--approved"], out: parsed.values["--out"], force: parsed.values["--force"] };
    const result = prepareLearn(specPath, opts);
    if (result.usage) {
      if (json) console.log(JSON.stringify({ spec: specPath ?? null, first: opts.first ?? null, approved: opts.approved ?? null, out: opts.out ?? null, error: result.error }, null, 2));
      else console.error(result.error);
      process.exit(2);
    }
    if (result.lintBlocked) printLintBlocked(result, json, "no packet written");
    if (json) console.log(JSON.stringify(result, null, 2));
    else console.log(`${result.path}\n${result.summary}`);
    process.exit(result.code);
  }

  if (sub === "record") {
    const parsed = parseArgs(argv.slice(2), { valueFlags: ["--verdict"], boolFlags: ["--json"] });
    if (parsed.error) { console.error(parsed.error); process.exit(2); }
    const [packetPath] = parsed.positionals;
    const json = parsed.values["--json"];
    const result = recordLearn(packetPath, parsed.values["--verdict"]);
    if (result.usage) {
      if (json) console.log(JSON.stringify({ packet: packetPath ?? null, verdict: parsed.values["--verdict"] ?? null, error: result.error }, null, 2));
      else console.error(result.error);
      process.exit(2);
    }
    if (json) console.log(JSON.stringify(result, null, 2));
    else if (result.invalid) {
      console.log(`learn: ${result.stale ? "stale packet" : "invalid verdict"}, nothing recorded`);
      for (const f of result.findings) printFinding(f);
    } else {
      console.log(`learn: ${result.edits} edit${result.edits === 1 ? "" : "s"} classified`);
      for (const [block, count] of Object.entries(result.tally)) console.log(`  ${block} ${count}`);
      console.log(`next move: ${result.next}`);
      if (result.verdict) console.log(`verdict: ${result.verdict} (${result.reason})`);
      if (result.ledgerWarning) console.log(`warn: ${result.ledgerWarning}`);
    }
    process.exit(result.code);
  }

  console.error(`unknown learn subcommand: ${sub ?? "(none)"}\n\n${HELP}`);
  process.exit(2);
}

// A spec that does not lint clean: print what lint would, say nothing was written, and exit with
// lint's own code. Shared by judge prepare and learn prepare.
function printLintBlocked(result, json, nothingWritten) {
  if (json) console.log(JSON.stringify(result, null, 2));
  else {
    const r = result.lintScore;
    console.log(`${result.specPath}: ${r.status} (${r.passed}/9)${r.open.length ? `, open: ${r.open.join(", ")}` : ""}`);
    for (const t of r.tests) if (!t.pass) console.log(`  ✗ ${t.n}. ${t.name}`);
    for (const f of result.lintFindings) console.log(`    ${f.severity === "fail" ? "fail" : "warn"} [${f.test}] ${f.message}\n         fix: ${f.fix}`);
    console.log(`${nothingWritten}: the spec is not ready (run \`hyperspec lint\` on it for details)`);
  }
  process.exit(result.code);
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
  // 2 here: compare's own ok:false without a usage flag is still "could not grade", i.e. an
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
