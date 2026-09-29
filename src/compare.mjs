import { appendFileSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, relative, resolve } from "node:path";
import { sha256 } from "./hash.mjs";
import { insideDir } from "./fsutil.mjs";
import { loadSpec } from "./load.mjs";
import { readRecipe } from "./recipe.mjs";

const present = (v) => typeof v === "string" && v.trim().length > 0;
const DOCTOR_MAX_BUFFER = 512 * 1024 * 1024;

// Spec requirement `compare`: grade a regenerated output and its parent through ONE doctor
// against ONE spec, so "the new one should be better" becomes a number, and flag a regression
// naming the change as the suspect. hyperspec never calls a model: the doctor is a command the
// caller supplies, run once per output via /bin/sh -c, with no recipe-derived value ever
// interpolated into the command string itself (only passed on stdin).
export function compare(childRecipePath, { doctor, parent: parentOption, spec: specOption } = {}) {
  const empty = () => ({ ok: false, parent: null, child: null, delta: null, regressed: null, suspect: null, specChanged: null, ledger: null, warnings: [] });
  const usage = (error) => ({ ...empty(), usage: true, error });
  const failed = (error, extra = {}) => ({ ...empty(), error, ...extra });

  if (!present(doctor)) return usage("a doctor command is required");
  if (!present(childRecipePath)) return usage("a child recipe path is required");

  // ---- Child -------------------------------------------------------------------------------------
  const childLoaded = readRecipe(childRecipePath);
  if (childLoaded.error) return usage(childLoaded.error);
  const { data: child, dir: childDir } = childLoaded;
  const childRecipeAbs = resolve(childRecipePath);

  // ---- Parent: defaults to the child's recorded parent.path -------------------------------------
  let parentPath = parentOption;
  if (!present(parentPath)) {
    if (!present(child.parent?.path)) return usage("the child recipe has no parent recorded, and none was given");
    parentPath = resolve(childDir, child.parent.path);
  } else {
    parentPath = resolve(process.cwd(), parentPath);
  }
  const parentLoaded = readRecipe(parentPath);
  if (parentLoaded.error) return usage(parentLoaded.error);
  const { data: parentRecipe, dir: parentDir } = parentLoaded;
  const parentRecipeAbs = resolve(parentPath);

  const warnings = [];
  // The child's recorded parent.sha256 is what the parent recipe's bytes were when the child was
  // made. Whatever parent recipe is actually being graded against here (the default or an explicit
  // override) may have moved since, which is worth a warning but never a refusal to compare.
  if (child.parent && present(child.parent.sha256)) {
    const parentBytes = readFileSync(parentRecipeAbs);
    if (sha256(parentBytes) !== child.parent.sha256) {
      warnings.push("parent recipe changed since the child was made");
    }
  }

  // ---- Spec: defaults to the child's spec path, graded ONCE for both outputs --------------------
  let specPath = specOption;
  if (!present(specPath)) {
    if (!present(child.spec?.path)) return usage("the child recipe has no spec path");
    specPath = resolve(childDir, child.spec.path);
  } else {
    specPath = resolve(process.cwd(), specPath);
  }
  const specLoaded = loadSpec(specPath);
  if (specLoaded.error) return usage(specLoaded.error);
  const specAbs = specLoaded.path;
  const specHash = sha256(readFileSync(specAbs));
  // specChanged is about the PARENT's record, not the child's: it tells the caller the spec being
  // graded against now differs from what the parent was made under. Both outputs still get graded
  // against this one spec file either way, never each against its own.
  const specChanged = parentRecipe.spec?.sha256 !== specHash;
  if (specChanged) warnings.push("spec changed since the parent was made; both outputs graded against the current file");

  // ---- Output files, resolved against each recipe's own directory --------------------------------
  const childOutputPath = child.output?.path;
  if (!present(childOutputPath)) return failed("the child recipe has no output path");
  if (!insideDir(childDir, childOutputPath)) return failed("the child recipe's output path escapes its recipe directory");
  const childOutputAbs = resolve(childDir, childOutputPath);
  let childOutputBytes;
  try { childOutputBytes = readFileSync(childOutputAbs); } catch { return failed(`cannot read the child's output: ${childOutputPath}`); }

  const parentOutputPath = parentRecipe.output?.path;
  if (!present(parentOutputPath)) return failed("the parent recipe has no output path");
  if (!insideDir(parentDir, parentOutputPath)) return failed("the parent recipe's output path escapes its recipe directory");
  const parentOutputAbs = resolve(parentDir, parentOutputPath);
  let parentOutputBytes;
  try { parentOutputBytes = readFileSync(parentOutputAbs); } catch { return failed(`cannot read the parent's output: ${parentOutputPath}`); }

  // A score is attributed to a recipe, so the bytes graded must be the bytes that recipe records.
  // A file edited by hand since (or never the recipe's output at all) would turn a hand edit into
  // a regression or an improvement blamed on the change, and write that into the ledger. Refuse
  // before the doctor runs; reproduce --restore puts the recorded bytes back.
  const stale = (bytes, recipe) => sha256(bytes) !== recipe.output?.sha256;
  if (stale(parentOutputBytes, parentRecipe)) return failed("parent output does not match its recipe; run hyperspec reproduce --restore");
  if (stale(childOutputBytes, child)) return failed("child output does not match its recipe; run hyperspec reproduce --restore");

  // ---- Grade, same doctor command for both, same spec for both -----------------------------------
  const parentGraded = runDoctor(doctor, parentOutputAbs, specAbs);
  if (parentGraded.error) return usage(`parent: ${parentGraded.error}`);
  const childGraded = runDoctor(doctor, childOutputAbs, specAbs);
  if (childGraded.error) return usage(`child: ${childGraded.error}`);

  const delta = childGraded.score - parentGraded.score;
  const regressed = childGraded.score < parentGraded.score;
  const suspect = regressed ? (child.change ?? null) : null;

  // ---- Ledger: one line of evidence for the self-upgrade loop, only if the spec declares one -----
  let ledgerPath = null;
  const ledgerDecl = specLoaded.data?.improvement?.ledger;
  if (present(ledgerDecl)) {
    const specDir = specLoaded.dir;
    if (!insideDir(specDir, ledgerDecl)) {
      warnings.push("improvement.ledger escapes the spec's directory; not appended");
    } else {
      const ledgerAbs = resolve(specDir, ledgerDecl);
      const ledgerDir = dirname(ledgerAbs);
      // The child's own `change` is null whenever it has no genealogical parent of its own (a root
      // recipe compared against an explicit, unrelated --parent; compare's usage check allows
      // this: it only requires *either* the child's recorded parent.path *or* an explicit
      // override). Fall back to naming what was actually compared against, so `change` and the
      // not-improved `reason` below are never "after null", which would be both a broken persisted record and,
      // for the "improved" verdict, a lint failure (rules.mjs's verdict-change: `!str(v.change)`).
      const childChange = child.change ?? `compared against ${relative(ledgerDir, parentRecipeAbs)}`;
      // A compare line must satisfy test 9 ("it improves itself"), which only knows the
      // verdict vocabulary one-shot/improved/not-improved, never a new "compare" verdict. A
      // strictly higher child score is improved (and already carries change, which doubles as
      // that verdict's required field). Equal or lower is not-improved, with a reason a later
      // session can argue with; when it's a genuine regression (strictly lower, not merely tied)
      // the reason is prefixed to say so.
      const line = {
        at: new Date().toISOString(),
        kind: "compare",
        parent: relative(ledgerDir, parentRecipeAbs),
        child: relative(ledgerDir, childRecipeAbs),
        scores: { parent: parentGraded.score, child: childGraded.score },
        regressed,
        change: childChange,
      };
      if (childGraded.score > parentGraded.score) {
        line.verdict = "improved";
      } else {
        line.verdict = "not-improved";
        const reasonBase = `compare: child scored ${childGraded.score} vs parent ${parentGraded.score} after ${childChange}`;
        line.reason = regressed ? `regression: ${reasonBase}` : reasonBase;
      }
      appendFileSync(ledgerAbs, `${JSON.stringify(line)}\n`);
      ledgerPath = ledgerAbs;
    }
  }

  return {
    ok: true,
    parent: { recipe: parentRecipeAbs, output: parentOutputAbs, score: parentGraded.score, notes: parentGraded.notes },
    child: { recipe: childRecipeAbs, output: childOutputAbs, score: childGraded.score, notes: childGraded.notes },
    delta,
    regressed,
    suspect,
    specChanged,
    ledger: ledgerPath,
    warnings,
  };
}

// Runs the doctor command once, via /bin/sh -c, over one output against the one spec. stdin is
// { output, spec } (absolute paths); the last non-empty stdout line must be JSON with a numeric
// score. Nothing recipe-derived is ever interpolated into the command string; it is only passed on
// stdin, so the same command string is reused verbatim for the parent and the child.
function runDoctor(doctorCmd, outputAbs, specAbs) {
  const res = spawnSync("/bin/sh", ["-c", doctorCmd], {
    input: JSON.stringify({ output: outputAbs, spec: specAbs }),
    maxBuffer: DOCTOR_MAX_BUFFER,
  });
  if (res.error) return { error: `doctor could not run: ${res.error.message}` };
  const stderr = res.stderr ? res.stderr.toString("utf8") : "";
  if (res.status !== 0) {
    const how = res.signal ? `was killed by ${res.signal}` : `exited ${res.status}`;
    const tail = stderr.trim().split("\n").slice(-5).join("\n");
    return { error: `doctor ${how}${tail ? `: ${tail}` : ""}` };
  }
  const stdout = res.stdout ? res.stdout.toString("utf8") : "";
  const lines = stdout.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return { error: "doctor produced no output" };
  const last = lines[lines.length - 1].trim();
  let value;
  try { value = JSON.parse(last); } catch (e) { return { error: `doctor's last line is not JSON: ${e.message}` }; }
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.score !== "number" || !Number.isFinite(value.score)) {
    return { error: "doctor's last line must be an object with a numeric score" };
  }
  return { score: value.score, notes: typeof value.notes === "string" ? value.notes : "" };
}
