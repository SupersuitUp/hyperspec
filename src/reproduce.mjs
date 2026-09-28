import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { sha256 } from "./hash.mjs";
import { getBlob, storeRoot, verifyBlob } from "./blobs.mjs";
import { readRecipe, stageKey } from "./recipe.mjs";

const present = (v) => typeof v === "string" && v.trim().length > 0;

// Spec requirement `reproduce`: replay the record and hash-check it. Never invokes a model,
// never runs a command, never regenerates a byte of content — every blob this looks at already
// exists in the store, and this only confirms the recipe's own claims about it still hold.
//
// Checks, in order (and every one is reported, nothing stops the walk early): every input blob
// verifies; the spec blob verifies; for each stage, its output blob verifies AND its recorded
// key equals the recomputed key; the output blob equals output.sha256; the output file on disk,
// if present, hashes to output.sha256.
export function reproduce(recipePath, { store, restore = false } = {}) {
  const loaded = readRecipe(recipePath);
  if (loaded.error) return { ok: false, error: loaded.error, steps: [], firstMismatch: null };
  const { data: recipe, dir } = loaded;
  const root = storeRoot({ from: dir, store });

  const steps = [];
  function addStep(ref, sha256Value, ok, why) {
    const step = { ref, sha256: sha256Value ?? null, ok };
    if (!ok && why) step.why = why;
    steps.push(step);
    return step;
  }

  // 1. Every input blob verifies.
  const inputs = Array.isArray(recipe.inputs) ? recipe.inputs : [];
  for (const input of inputs) {
    const hex = input?.sha256;
    const ok = present(hex) && verifyBlob(root, hex);
    addStep(`input:${input?.name}`, hex, ok, "input blob missing or does not match its recorded hash");
  }

  // 2. The spec blob verifies.
  {
    const hex = recipe.spec?.sha256;
    const ok = present(hex) && verifyBlob(root, hex);
    addStep("spec", hex, ok, "spec blob missing or does not match its recorded hash");
  }

  // 3. For each stage: its output blob verifies, and its recorded key equals the recomputed key.
  const stages = Array.isArray(recipe.stages) ? recipe.stages : [];
  stages.forEach((stage, index) => {
    const id = stage?.id ?? `#${index}`;
    const pending = stage?.pending === true || stage?.output == null || !present(stage.output?.sha256);
    if (pending) {
      addStep(`stage:${id}`, stage?.output?.sha256, false, "stage is pending");
    } else {
      const hex = stage.output.sha256;
      const ok = verifyBlob(root, hex);
      addStep(`stage:${id}`, hex, ok, "stage output blob missing or does not match its recorded hash");
    }

    let keyOk = false;
    let keyWhy = "stage key could not be recomputed";
    try {
      const recomputed = stageKey(recipe, index);
      keyOk = present(stage?.key) && stage.key === recomputed;
      if (!keyOk) keyWhy = "recorded key does not match the recomputed key";
    } catch (e) {
      keyWhy = `stage key could not be recomputed: ${e.message}`;
    }
    addStep(`stage:${id}#key`, stage?.key, keyOk, keyWhy);
  });

  // 4. The output blob equals output.sha256.
  const outputSha = recipe.output?.sha256;
  const lastStage = stages[stages.length - 1];
  let outputBlobOk = false;
  let outputBlobWhy = "output.sha256 is missing";
  if (present(outputSha)) {
    if (!lastStage || lastStage.output?.sha256 !== outputSha) {
      outputBlobWhy = "output.sha256 does not match the last stage's output";
    } else if (!verifyBlob(root, outputSha)) {
      outputBlobWhy = "output blob missing or does not match output.sha256";
    } else {
      outputBlobOk = true;
    }
  }
  addStep("output:blob", outputSha, outputBlobOk, outputBlobWhy);

  // 5. The output file on disk, if present, hashes to output.sha256. Absent is vacuously fine:
  // reproduce doesn't require the file to already exist, only that it agrees when it does.
  const outputPath = recipe.output?.path;
  const outputAbs = present(outputPath) ? resolve(dir, outputPath) : null;
  const fileStep = addStep("output:file", outputSha, true);
  let restored = false;
  if (outputAbs) {
    const fileExists = existsSync(outputAbs);
    let matches = true;
    if (fileExists) {
      const bytes = readFileSync(outputAbs);
      matches = present(outputSha) && sha256(bytes) === outputSha;
      if (!matches) {
        fileStep.ok = false;
        fileStep.why = "output file does not match output.sha256";
      }
    }
    // restore: true writes the output file from its blob, but only when the output blob itself
    // verifies (step 4) — restoring from an unverified blob would just write different wrong
    // bytes. Covers both a lost file (never existed / deleted) and an edited one.
    const needsRestore = !fileExists || !matches;
    if (restore && needsRestore && outputBlobOk) {
      const blob = getBlob(root, outputSha);
      if (blob !== null) {
        writeFileSync(outputAbs, blob);
        restored = true;
        fileStep.ok = true;
        delete fileStep.why;
      }
    }
  }

  const firstFail = steps.find((s) => !s.ok);
  return {
    ok: steps.every((s) => s.ok),
    steps,
    firstMismatch: firstFail ? firstFail.ref : null,
    restored,
  };
}
