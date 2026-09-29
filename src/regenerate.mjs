import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { sha256 } from "./hash.mjs";
import { getBlob, putBlob, storeRoot } from "./blobs.mjs";
import { insideDir, writeFileAtomic } from "./fsutil.mjs";
import { readRecipe, resolveReads, stageKey, writeRecipe } from "./recipe.mjs";

const present = (v) => typeof v === "string" && v.trim().length > 0;
const CHANGE_KEYS = ["addInput", "swapInput", "factoryVersion"];
const RUNNER_MAX_BUFFER = 512 * 1024 * 1024;

// Spec requirement `regenerate`: a recipe plus exactly ONE named change (a new input, a swapped
// input, or a newer factory version) makes a child recipe that names its parent and the change.
// Only the stages downstream of the change rerun; every other stage reuses its recorded output.
//
// Reuse is PROVEN, never assumed: a stage is reused only when its key, recomputed from the
// child's hashes, equals the key the parent recorded for it, and only once its recorded output
// blob re-hashes to what the parent claims, and only if the parent's recorded key matches the
// parent's own record. A stage whose key differs reruns. With a runner that is decided per stage
// at run time, after upstream reruns have produced their real bytes, so a reader whose key is
// unchanged is reused. Without one, every transitive reader of a rerun stage is pending,
// since its reads are unknown (transitive readers, not every later stage).
//
// hyperspec never calls a model. Rerun stages are run by `run`, a shell command the caller
// supplies; without one the child is written with those stages pending.
//
// Nothing is written until the outcome is known: new input bytes and rerun outputs are held in
// memory, and only land in the blob store (with the output file and the child recipe) once every
// stage has run, or, with no runner, once the pending plan is settled. The parent recipe, its
// output and its blobs are only ever read.
export function regenerate(parentRecipePath, { out, clicker, change, run, changeText, store } = {}) {
  const usage = (error) => ({ ok: false, usage: true, error, childRecipe: null, plan: [], pending: false, failedVerdicts: [] });
  const failed = (error, extra = {}) => ({ ok: false, error, childRecipe: null, plan: [], pending: false, failedVerdicts: [], ...extra });

  // ---- Options -------------------------------------------------------------------------------
  const changeKeys = change && typeof change === "object" ? Object.keys(change).filter((k) => change[k] !== undefined) : [];
  if (changeKeys.length !== 1 || !CHANGE_KEYS.includes(changeKeys[0])) {
    return usage("exactly one change is required: an added input, a swapped input, or a factory version");
  }
  if (!present(clicker)) return usage("clicker is required");
  if (!present(out)) return usage("out is required");

  // ---- Parent ----------------------------------------------------------------------------------
  const parentAbs = resolve(process.cwd(), parentRecipePath);
  const loaded = readRecipe(parentAbs);
  if (loaded.error) return usage(loaded.error);
  const parentBytes = readFileSync(parentAbs);
  const { data: parent, dir: parentDir } = loaded;
  const parentStages = Array.isArray(parent.stages) ? parent.stages : [];
  const parentInputs = Array.isArray(parent.inputs) ? parent.inputs : [];
  if (parentStages.length === 0) return usage("the parent recipe has no stages");
  if (!present(parent.spec?.sha256)) return usage("the parent recipe has no spec.sha256");

  // The parent recipe is a plain JSON file, so its output.path is not trusted blind: one naming a
  // place outside its own directory is refused rather than compared against (same rule as reproduce).
  const parentOutputPath = parent.output?.path;
  if (present(parentOutputPath) && !insideDir(parentDir, parentOutputPath)) {
    return usage("the parent recipe's output path escapes its recipe directory");
  }

  // ---- Out -------------------------------------------------------------------------------------
  const outAbs = resolve(process.cwd(), out);
  const childRecipePath = `${outAbs}.recipe.json`;
  const childDir = dirname(outAbs);
  if (present(parentOutputPath) && resolve(parentDir, parentOutputPath) === outAbs) {
    return usage(`${out} is the parent's output; the child needs its own path`);
  }
  if (existsSync(outAbs)) return usage(`${out} already exists; refusing to overwrite it`);
  if (existsSync(childRecipePath)) return usage(`${childRecipePath} already exists; refusing to overwrite it`);
  if (!isDir(childDir)) return usage(`directory ${childDir} does not exist`);

  const childRoot = storeRoot({ from: childDir, store });
  const parentRoot = storeRoot({ from: parentDir, store });
  const held = new Map(); // hex -> Buffer, written to the store only once the outcome is known

  // ---- The child, with the change applied ------------------------------------------------------
  const rel = (abs) => relative(childDir, abs);
  const rebase = (p) => (present(p) ? rel(resolve(parentDir, p)) : p);
  const child = {
    recipe: "0.1",
    created: new Date().toISOString(),
    output: { path: rel(outAbs), sha256: null },
    factory: { ...(parent.factory ?? {}) },
    spec: { ...parent.spec, path: rebase(parent.spec?.path) },
    inputs: parentInputs.map((i) => ({ ...i, path: rebase(i.path) })),
    stages: parentStages.map((s) => structuredClone(s)),
    clicker,
    approver: null,
    parent: { path: rel(parentAbs), sha256: sha256(parentBytes) },
    change: null,
  };

  let defaultChange;
  const kind = changeKeys[0];
  if (kind === "addInput") {
    const { name, path, reads = [] } = change.addInput ?? {};
    if (!present(name) || !present(path)) return usage("an added input needs a name and a path");
    if (child.inputs.some((i) => i.name === name)) return usage(`input ${name} already exists; swap it instead`);
    if (!Array.isArray(reads)) return usage("reads must be a list of stage ids");
    for (const id of reads) {
      if (!child.stages.some((s) => s.id === id)) return usage(`no stage ${id} to read input ${name}`);
    }
    const abs = resolve(process.cwd(), path);
    const bytes = readBytes(abs);
    if (!bytes) return usage(`cannot read ${path}`);
    const hex = hold(held, bytes);
    const order = child.inputs.reduce((m, i) => Math.max(m, i.order ?? 0), 0) + 1;
    child.inputs.push({ name, path: rel(abs), sha256: hex, order });
    const ref = `input:${name}`;
    for (const id of reads) {
      const stage = child.stages.find((s) => s.id === id);
      // A stage with an empty reads already reads every input; making its reads explicit here
      // would silently stop it reading everything else, so it is left as it is.
      if (Array.isArray(stage.reads) && stage.reads.length && !stage.reads.includes(ref)) stage.reads = [...stage.reads, ref];
    }
    defaultChange = `added input ${name} (${rel(abs)})`;
  } else if (kind === "swapInput") {
    const { name, path } = change.swapInput ?? {};
    if (!present(name) || !present(path)) return usage("a swapped input needs a name and a path");
    const input = child.inputs.find((i) => i.name === name);
    if (!input) return usage(`no input ${name} to swap`);
    const abs = resolve(process.cwd(), path);
    const bytes = readBytes(abs);
    if (!bytes) return usage(`cannot read ${path}`);
    if (sha256(bytes) === input.sha256) return usage(`swap does not change input ${name}: ${path} has the same bytes`);
    input.sha256 = hold(held, bytes);
    input.path = rel(abs);
    defaultChange = `swapped input ${name} to ${rel(abs)}`;
  } else {
    const version = change.factoryVersion;
    if (!present(version)) return usage("factory version must be a non-empty string");
    if (version === parent.factory?.version) return usage(`factory is already ${version}; that is not a change`);
    child.factory.version = version;
    defaultChange = `factory ${parent.factory?.version} to ${version}`;
  }
  child.change = present(changeText) ? changeText : defaultChange;

  // Every blob the child names must be verified and reachable from the child's own store, or a
  // reproduce of the child could not stand on its own. A blob found only in the parent's store
  // (the child lives under a different root) is carried over, re-hashed on the way.
  const fetch = (hex) => {
    if (held.has(hex)) return held.get(hex);
    for (const root of childRoot === parentRoot ? [childRoot] : [childRoot, parentRoot]) {
      const bytes = getBlob(root, hex);
      if (bytes !== null && sha256(bytes) === hex) {
        if (root !== childRoot) held.set(hex, bytes);
        return bytes;
      }
    }
    return null;
  };
  for (const input of child.inputs) {
    if (!present(input.sha256) || !fetch(input.sha256)) return failed(`input ${input.name}: blob missing or does not match its recorded hash`);
  }
  if (!fetch(child.spec.sha256)) return failed("spec: blob missing or does not match its recorded hash");

  // ---- Plan and run ----------------------------------------------------------------------------
  // Each stage is decided in order, once everything it reads is known. With a runner, an upstream
  // rerun has already produced its real bytes by the time its readers are decided, so a reader is
  // reused whenever its key still matches (a deterministic upstream that reproduced its parent
  // bytes changes nothing downstream). Without a runner, a reader of a pending stage cannot be
  // keyed, so it is pending too.
  const plan = [];
  const pendingIds = new Set();
  const failedVerdicts = [];
  for (let i = 0; i < child.stages.length; i++) {
    const stage = child.stages[i];
    let refs;
    try {
      refs = resolveReads(child, i).map(([ref]) => ref);
    } catch (e) {
      return failed(`stage ${stage.id}: ${e.message}`, { plan });
    }
    if (refs.some((ref) => ref.startsWith("stage:") && pendingIds.has(ref.slice("stage:".length)))) {
      markPending(stage, null); // reads a stage not yet run, so its key cannot be known
      pendingIds.add(stage.id);
      plan.push({ id: stage.id, action: "rerun" });
      continue;
    }

    const key = stageKey(child, i);
    const decision = reusable(parent, i, key);
    if (decision.reuse) {
      if (!fetch(parentStages[i].output.sha256)) {
        return failed(`stage ${stage.id}: recorded output blob missing or does not match its hash; cannot reuse an unverifiable stage`, { plan });
      }
      // The clone already carries the parent's output, verdict and (equal) key.
      plan.push({ id: stage.id, action: "reuse" });
      continue;
    }

    const entry = { id: stage.id, action: "rerun" };
    if (decision.reason) entry.reason = decision.reason;
    plan.push(entry);
    if (!present(run)) {
      markPending(stage, key);
      pendingIds.add(stage.id);
      continue;
    }
    const result = runStage(run, child, i, fetch);
    if (result.error) return failed(`stage ${stage.id}: ${result.error}`, { failedStage: stage.id, plan });
    delete stage.pending;
    stage.output = { sha256: hold(held, result.output) };
    stage.verdict = result.verdict;
    stage.key = stageKey(child, i);
    if (result.verdict.pass === false) failedVerdicts.push(stage.id);
  }

  // ---- Write -----------------------------------------------------------------------------------
  const last = child.stages[child.stages.length - 1];
  child.output.sha256 = last.output?.sha256 ?? null;
  const pending = pendingIds.size > 0;

  // A runner may take minutes, and anything may have appeared at out meanwhile (the runner itself
  // included). Check again right before the first write, and refuse with nothing written.
  if (existsSync(outAbs)) return usage(`${out} already exists; refusing to overwrite it`);
  if (existsSync(childRecipePath)) return usage(`${childRecipePath} already exists; refusing to overwrite it`);

  for (const bytes of held.values()) putBlob(childRoot, bytes);
  if (!pending) {
    // The child's output is the last stage's blob, written atomically and read back.
    writeFileAtomic(outAbs, fetch(child.output.sha256));
    if (sha256(readFileSync(outAbs)) !== child.output.sha256) {
      try { unlinkSync(outAbs); } catch { /* nothing to remove */ }
      return failed(`${out} does not hash to the child's output.sha256`, { plan });
    }
  }
  writeRecipe(childRecipePath, child);
  return { ok: true, childRecipe: childRecipePath, output: pending ? null : outAbs, plan, pending, failedVerdicts };
}

// Reuse is proven twice over: the key recomputed from the child's hashes equals the key the parent
// recorded, AND the parent's recorded key equals the key recomputed from the parent's own recorded
// hashes. Without the second check, a parent key edited to match the child would pass an old
// output off as made under conditions it never was, and a reproduce of the child could not tell.
function reusable(parent, index, childKey) {
  const ps = parent.stages[index];
  if (!ps || ps.pending === true || !present(ps.output?.sha256) || !present(ps.key)) return { reuse: false };
  let selfKey;
  try { selfKey = stageKey(parent, index); } catch { selfKey = null; }
  if (selfKey !== ps.key) return { reuse: false, reason: "parent key does not match its record" };
  return { reuse: childKey === ps.key };
}

function markPending(stage, key) {
  stage.key = key;
  stage.output = null;
  stage.verdict = null;
  stage.pending = true;
}

// Runs one stage through the caller's runner. The runner gets, on stdin, the stage id, its
// resolved reads (each materialized from its blob into a temp file) and its model; its stdout,
// byte for byte, is the stage's output. A final `VERDICT {...}` line on stderr is the verdict.
function runStage(run, recipe, index, fetch) {
  const stage = recipe.stages[index];
  const tmp = mkdtempSync(join(tmpdir(), "hyperspec-run-"));
  try {
    const reads = resolveReads(recipe, index).map(([ref, hex], n) => {
      const bytes = fetch(hex);
      if (!bytes) throw new Error(`read ${ref}: blob ${hex} missing`);
      const path = join(tmp, `${n}-${ref.replace(/[^A-Za-z0-9._-]/g, "_")}`);
      writeFileSync(path, bytes);
      return { ref, sha256: hex, path };
    });
    const job = { stage: stage.id, reads, model: stage.model ?? null };
    const res = spawnSync("/bin/sh", ["-c", run], { input: JSON.stringify(job), maxBuffer: RUNNER_MAX_BUFFER });
    const stderr = res.stderr ? res.stderr.toString("utf8") : "";
    if (res.error) return { error: `runner could not run: ${res.error.message}` };
    if (res.status !== 0) {
      const how = res.signal ? `was killed by ${res.signal}` : `exited ${res.status}`;
      const tail = stderr.trim().split("\n").slice(-5).join("\n");
      return { error: `runner ${how}${tail ? `: ${tail}` : ""}` };
    }
    const verdict = parseVerdict(stderr);
    if (verdict.error) return { error: verdict.error };
    return { output: res.stdout, verdict: verdict.value };
  } catch (e) {
    return { error: e.message };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function parseVerdict(stderr) {
  const lines = stderr.split(/\r?\n/).filter((l) => l.startsWith("VERDICT "));
  if (!lines.length) return { value: { station: "runner", pass: true, note: "no verdict reported" } };
  const text = lines[lines.length - 1].slice("VERDICT ".length).trim();
  let value;
  try { value = JSON.parse(text); } catch (e) { return { error: `invalid VERDICT line from the runner: ${e.message}` }; }
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.pass !== "boolean") {
    return { error: "invalid VERDICT line from the runner: it must be an object with a boolean pass" };
  }
  return { value: { station: "runner", note: "", ...value } };
}

function hold(held, bytes) {
  const hex = sha256(bytes);
  if (!held.has(hex)) held.set(hex, bytes);
  return hex;
}

function readBytes(abs) {
  try { return readFileSync(abs); } catch { return null; }
}

function isDir(p) {
  try { return statSync(p).isDirectory(); } catch { return false; }
}
