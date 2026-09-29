import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sha256 } from "./hash.mjs";
import { getBlob, isSha256, storeRoot, verifyBlob } from "./blobs.mjs";
import { insideDir, writeFileAtomic } from "./fsutil.mjs";
import { readRecipe, stageKey } from "./recipe.mjs";

const present = (v) => typeof v === "string" && v.trim().length > 0;
const MALFORMED = "recorded hash is not a SHA-256 hash (64 lowercase hex characters)";
// A recorded hash that is not well formed names no blob at all; say so rather than "missing".
const blobWhy = (hex, why) => (present(hex) && !isSha256(hex) ? MALFORMED : why);

// Spec requirement `reproduce`: replay the record and hash-check it. Never invokes a model,
// never runs a command, never regenerates a byte of content. Every blob this looks at already
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
  // Every step's ok/why is decided through setStep, including its own creation (addStep). One
  // path for every mutation, so a step is never left with a stale why after a later change.
  function setStep(step, ok, why) {
    step.ok = ok;
    if (ok || !why) delete step.why;
    else step.why = why;
  }
  function addStep(ref, sha256Value, ok, why) {
    const step = { ref, sha256: sha256Value ?? null, ok: true };
    steps.push(step);
    setStep(step, ok, why);
    return step;
  }

  // 1. Every input blob verifies.
  const inputs = Array.isArray(recipe.inputs) ? recipe.inputs : [];
  for (const input of inputs) {
    const hex = input?.sha256;
    const ok = present(hex) && verifyBlob(root, hex);
    addStep(`input:${input?.name}`, hex, ok, blobWhy(hex, "input blob missing or does not match its recorded hash"));
  }

  // 2. The spec blob verifies.
  {
    const hex = recipe.spec?.sha256;
    const ok = present(hex) && verifyBlob(root, hex);
    addStep("spec", hex, ok, blobWhy(hex, "spec blob missing or does not match its recorded hash"));
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
      addStep(`stage:${id}`, hex, ok, blobWhy(hex, "stage output blob missing or does not match its recorded hash"));
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
      outputBlobWhy = blobWhy(outputSha, "output blob missing or does not match output.sha256");
    } else {
      outputBlobOk = true;
    }
  }
  addStep("output:blob", outputSha, outputBlobOk, outputBlobWhy);

  // 5. The output file on disk, if present, hashes to output.sha256. Absent is vacuously fine:
  // reproduce doesn't require the file to already exist, only that it agrees when it does.
  //
  // The recipe is a plain JSON file on disk, exactly the kind of claim reproduce exists to
  // distrust, so output.path is never trusted blind. A hand-edited or corrupted recipe could
  // name a path outside the recipe's own directory (a `../` climb, or an absolute path); refuse
  // before touching disk at all, rather than reading from or (worse, under --restore) writing to
  // wherever it points.
  const outputPath = recipe.output?.path;
  let restored = false;
  if (present(outputPath) && !insideDir(dir, outputPath)) {
    addStep("output:file", outputSha, false, "output path escapes the recipe directory");
  } else {
    const outputAbs = present(outputPath) ? resolve(dir, outputPath) : null;
    const fileStep = addStep("output:file", outputSha, true);
    if (outputAbs) {
      const fileExists = existsSync(outputAbs);
      let matches = true;
      if (fileExists) {
        const bytes = readFileSync(outputAbs);
        matches = present(outputSha) && sha256(bytes) === outputSha;
        if (!matches) setStep(fileStep, false, "output file does not match output.sha256");
      }

      // restore: true writes the output file from its blob, but only when the output blob
      // itself verified (step 4); restoring from an unverified blob would just write
      // different wrong bytes. Covers both a lost file (never existed / deleted) and an
      // edited one. The write is atomic (temp file + rename, same pattern as putBlob), so a
      // crash mid-write never leaves the file in a state that is neither the old nor the new
      // content, and a write failure is caught and reported as a failing step rather than
      // thrown out of reproduce(): this function always returns a structured result.
      const needsRestore = !fileExists || !matches;
      if (restore && needsRestore && outputBlobOk) {
        const blob = getBlob(root, outputSha);
        if (blob !== null) {
          try {
            writeFileAtomic(outputAbs, blob);
            restored = true;
            // Re-evaluate for real: read back what actually landed on disk and hash it, rather
            // than assuming the write did what it intended.
            const writtenBytes = readFileSync(outputAbs);
            const writtenOk = present(outputSha) && sha256(writtenBytes) === outputSha;
            setStep(fileStep, writtenOk, "restored output file does not match output.sha256");
          } catch (e) {
            setStep(fileStep, false, `failed to restore the output file: ${e.message}`);
          }
        }
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
