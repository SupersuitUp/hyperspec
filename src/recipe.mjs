import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { canonical, sha256 } from "./hash.mjs";

const present = (v) => typeof v === "string" && v.trim().length > 0;

export function readRecipe(path) {
  const abs = resolve(path);
  let text;
  try { text = readFileSync(abs, "utf8"); } catch { return { error: `cannot read ${path}` }; }
  let data;
  try { data = JSON.parse(text); } catch (e) { return { error: `invalid JSON in ${path}: ${e.message}` }; }
  return { data, dir: dirname(abs) };
}

// Pretty-printed (2-space indent) with a trailing newline, per the recipe file convention.
export function writeRecipe(path, data) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

// A stage with a declared, non-empty `reads` resolves exactly those refs. An empty (or missing)
// `reads` means "read everything": every input in order, then every earlier stage in array
// order, then spec (spec decision downstream-rerun-detection).
export function resolveReads(recipe, stageIndex) {
  const stages = Array.isArray(recipe.stages) ? recipe.stages : [];
  const stage = stages[stageIndex];
  if (!stage) throw new Error(`no stage at index ${stageIndex}`);
  const declared = Array.isArray(stage.reads) && stage.reads.length ? stage.reads : expandReads(recipe, stageIndex);
  return declared.map((ref) => [ref, resolveRef(recipe, stageIndex, ref)]);
}

function expandReads(recipe, stageIndex) {
  const inputs = [...(Array.isArray(recipe.inputs) ? recipe.inputs : [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const stages = Array.isArray(recipe.stages) ? recipe.stages : [];
  return [
    ...inputs.map((i) => `input:${i.name}`),
    ...stages.slice(0, stageIndex).map((s) => `stage:${s.id}`),
    "spec",
  ];
}

function resolveRef(recipe, stageIndex, ref) {
  if (ref === "spec") {
    const hex = recipe.spec?.sha256;
    if (!present(hex)) throw new Error(`stage ${stageIndex}: spec has no sha256`);
    return hex;
  }
  if (typeof ref === "string" && ref.startsWith("input:")) {
    const name = ref.slice("input:".length);
    const input = (Array.isArray(recipe.inputs) ? recipe.inputs : []).find((i) => i.name === name);
    if (!input) throw new Error(`stage ${stageIndex}: unknown read "${ref}"`);
    return input.sha256;
  }
  if (typeof ref === "string" && ref.startsWith("stage:")) {
    const id = ref.slice("stage:".length);
    const stages = Array.isArray(recipe.stages) ? recipe.stages : [];
    const idx = stages.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error(`stage ${stageIndex}: unknown read "${ref}"`);
    if (idx >= stageIndex) throw new Error(`stage ${stageIndex}: "${ref}" is not an earlier stage`);
    return stages[idx].output?.sha256;
  }
  throw new Error(`stage ${stageIndex}: unknown read "${ref}"`);
}

// sha256(canonical({ reads, spec, factory, model })) where reads is the resolved [ref, hex] list
// in declared (or expanded) order, spec is spec.sha256, factory is factory.version, and model is
// the stage's own model settings or null.
export function stageKey(recipe, stageIndex) {
  const stages = Array.isArray(recipe.stages) ? recipe.stages : [];
  const stage = stages[stageIndex];
  if (!stage) throw new Error(`no stage at index ${stageIndex}`);
  const reads = resolveReads(recipe, stageIndex);
  return sha256(canonical({
    reads,
    spec: recipe.spec?.sha256,
    factory: recipe.factory?.version,
    model: stage.model ?? null,
  }));
}

// Implements spec requirement recipe-completeness: every fail below is a field the recipe must
// carry for it to count as done; the one warn flags a stage that will rerun on every regeneration
// because it declared nothing.
export function checkRecipe(recipe, { root } = {}) {
  const out = [];
  const fail = (field, message) => out.push({ severity: "fail", field, message });
  const warn = (field, message) => out.push({ severity: "warn", field, message });

  if (!present(recipe.factory?.version)) fail("factory.version", "factory.version is missing");
  if (!present(recipe.spec?.sha256)) fail("spec.sha256", "spec.sha256 is missing");
  const authors = recipe.spec?.authors;
  if (!authors || typeof authors !== "object" || Array.isArray(authors) || Object.keys(authors).length === 0) {
    fail("spec.authors", "spec.authors is missing");
  }
  if (!present(recipe.clicker)) fail("clicker", "clicker is missing");
  if (!present(recipe.approver)) fail("approver", "approver is missing");

  const parentSet = recipe.parent !== null && recipe.parent !== undefined;
  const changeSet = recipe.change !== null && recipe.change !== undefined;
  if (parentSet !== changeSet) fail("parent", "parent and change must both be null or both be set");

  const inputs = Array.isArray(recipe.inputs) ? recipe.inputs : [];
  inputs.forEach((input, i) => {
    if (!present(input?.sha256)) fail(`inputs[${i}].sha256`, `input "${input?.name ?? i}" has no sha256`);
  });

  const stages = Array.isArray(recipe.stages) ? recipe.stages : [];
  stages.forEach((stage, i) => {
    const id = stage?.id ?? `#${i}`;

    if (!stage?.verdict || typeof stage.verdict !== "object") {
      fail(`stages[${i}].verdict`, `stage "${id}" has no verdict`);
    } else if (typeof stage.verdict.pass !== "boolean") {
      fail(`stages[${i}].verdict.pass`, `stage "${id}" verdict.pass is not a boolean`);
    }

    // R2: pending: true, or a null/incomplete output, makes the stage incomplete by definition.
    if (stage?.pending === true || stage?.output == null || !present(stage.output?.sha256)) {
      fail(`stages[${i}]`, `stage ${id} is pending`);
    }

    if (!Array.isArray(stage?.reads) || stage.reads.length === 0) {
      warn(`stages[${i}].reads`, `stage "${id}" declares no reads, so it reruns on every regeneration; declare what it reads`);
    }

    try {
      const recomputed = stageKey(recipe, i);
      if (stage?.key !== recomputed) fail(`stages[${i}].key`, `stage "${id}" key does not match its recomputed key`);
    } catch (e) {
      // A bad ref is why the key can't be recomputed, but this is still a key-completeness
      // failure, not the reads-declaration warn: keep it on its own field so a caller grouping
      // or deduping findings by field can't collapse a blocking fail into an informational warn.
      fail(`stages[${i}].key`, `stage "${id}" key could not be recomputed: ${e.message}`);
    }
  });

  if (stages.length) {
    const last = stages[stages.length - 1];
    const lastHash = last?.output?.sha256;
    if (present(lastHash) && lastHash !== recipe.output?.sha256) {
      fail("output.sha256", "the last stage's output does not match output.sha256");
    }
  }

  return out;
}
