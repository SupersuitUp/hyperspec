import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { sha256 } from "./hash.mjs";
import { writeFileAtomic } from "./fsutil.mjs";
import { storeRoot, putBlob, getBlob } from "./blobs.mjs";
import { checkRecipe, readRecipe, stageKey, writeRecipe } from "./recipe.mjs";
import { loadSpec } from "./load.mjs";

// What every outcome factory calls at the end of a run to record what it made, from what, and
// how. output and spec are paths, resolved against process.cwd(); every path stored inside the
// recipe (output.path, spec.path, each input's path) is relative to the recipe file's own
// directory, per the recipe file convention (constraints.md).
export function startRecipe({ output, factory, spec, clicker, store } = {}) {
  const outputAbs = resolve(process.cwd(), output);
  const recipePath = `${outputAbs}.recipe.json`;
  const recipeDir = dirname(recipePath);
  const root = storeRoot({ from: recipeDir, store });

  const specLoaded = loadSpec(spec);
  if (specLoaded.error) throw new Error(specLoaded.error);
  const specBytes = readFileSync(specLoaded.path);
  const specHash = putBlob(root, specBytes);
  // spec.authors is id -> author across decisions and requirements together; the two arrays
  // share one id namespace here (every field is traced back to its source), so an id reused
  // across them is a collision, not a silent overwrite, whether or not the authors agree.
  const authors = {};
  for (const d of [...(specLoaded.data.decisions ?? []), ...(specLoaded.data.requirements ?? [])]) {
    if (!d || typeof d.id !== "string") continue;
    if (Object.prototype.hasOwnProperty.call(authors, d.id)) {
      throw new Error(`spec id ${d.id} is used twice; ids must be unique across decisions and requirements`);
    }
    authors[d.id] = d.author;
  }

  const recipe = {
    recipe: "0.1",
    created: new Date().toISOString(),
    output: { path: relative(recipeDir, outputAbs), sha256: null },
    factory,
    spec: { path: relative(recipeDir, specLoaded.path), sha256: specHash, authors },
    inputs: [],
    stages: [],
    clicker,
    approver: null,
    parent: null,
    change: null,
  };

  return {
    // Stores the file's bytes as a blob now and records {name, path, sha256, order}. order is
    // assigned by call order, starting at 1. A duplicate name throws.
    input(name, path) {
      if (recipe.inputs.some((i) => i.name === name)) throw new Error(`duplicate input name: ${name}`);
      const abs = resolve(process.cwd(), path);
      const bytes = readFileSync(abs);
      const hex = putBlob(root, bytes);
      const entry = { name, path: relative(recipeDir, abs), sha256: hex, order: recipe.inputs.length + 1 };
      recipe.inputs.push(entry);
      return entry;
    },

    // Stores output (string or Buffer) as a blob, computes key with stageKey, and validates reads
    // by delegating to stageKey/resolveReads (an unknown ref throws). A duplicate id throws too,
    // since resolveReads resolves a stage: ref by id and a duplicate would make that ambiguous.
    stage({ id, reads, model, output: stageOutput, verdict } = {}) {
      if (!id) throw new Error("stage needs an id");
      if (recipe.stages.some((s) => s.id === id)) throw new Error(`duplicate stage id: ${id}`);
      const hex = putBlob(root, stageOutput);
      const index = recipe.stages.length;
      const entry = { id, reads: reads ?? [], model: model ?? undefined, key: undefined, output: { sha256: hex }, verdict };
      recipe.stages.push(entry);
      try {
        entry.key = stageKey(recipe, index);
      } catch (e) {
        recipe.stages.pop();
        throw e;
      }
      return entry;
    },

    // Writes the output file from the last stage's blob if it is absent, or checks the file on
    // disk against it if present (throwing on a mismatch: the output on disk must be what the
    // recipe says). Writes the recipe file and returns checkRecipe's findings; an unapproved
    // recipe returning only the approver fail is expected, not an error. Refuses a stage-less
    // recipe before writing anything (neither the output file nor the recipe file): a recipe
    // with no stages has nothing to have made, so finishing one would write an "approved" recipe
    // for content that does not exist.
    finish({ approver = null } = {}) {
      if (!recipe.stages.length) throw new Error("a recipe needs at least one stage");
      recipe.approver = approver;
      const last = recipe.stages[recipe.stages.length - 1];
      recipe.output.sha256 = last.output.sha256;
      if (existsSync(outputAbs)) {
        const onDisk = readFileSync(outputAbs);
        if (sha256(onDisk) !== last.output.sha256) {
          throw new Error(`${output} does not match the recipe's last stage output`);
        }
      } else {
        writeFileAtomic(outputAbs, getBlob(root, last.output.sha256));
      }
      writeRecipe(recipePath, recipe);
      return { path: recipePath, findings: checkRecipe(recipe, { root }) };
    },
  };
}

// Rereads the recipe, sets approver, rewrites it, and returns the new findings.
export function approve(recipePath, by) {
  const { data, dir, error } = readRecipe(recipePath);
  if (error) throw new Error(error);
  data.approver = by;
  writeRecipe(recipePath, data);
  return checkRecipe(data, { root: storeRoot({ from: dir }) });
}
