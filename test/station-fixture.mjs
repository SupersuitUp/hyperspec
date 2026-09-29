// Test helpers shared by the quotes, private and dna station tests: a copy of the writing-valid
// fixture in its own temp dir (so nothing a test writes touches the checked-in fixture), with its
// one material (m1) optionally re-marked from a list of labeled paragraphs, so a test can put a
// quote, story or private segment in front of a station without hand-computing offsets.

import { cpSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { tempDir } from "./tmp.mjs";
import { loadSpec } from "../src/load.mjs";
import { sha256 } from "../src/hash.mjs";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = join(ROOT, "test", "fixtures", "writing-valid");

export const cli = (...a) => spawnSync(process.execPath, [join(ROOT, "bin", "hyperspec.mjs"), ...a], { encoding: "utf8" });

// Writes a material made of `paragraphs` (each { text, label, ...fields }) joined by blank lines,
// and a segments file covering it exactly, one segment per paragraph (so lint's coverage, verbatim
// and staleness checks all hold). Returns the material's text.
export function markMaterial(dir, paragraphs, { path = "materials/call-2026-09-28.md", id = "m1" } = {}) {
  const text = paragraphs.map((p) => p.text).join("\n\n");
  const lines = [JSON.stringify({ material: id, path, sha256: sha256(Buffer.from(text, "utf8")) })];
  let pos = 0;
  paragraphs.forEach((p, i) => {
    const { text: t, ...fields } = p;
    lines.push(JSON.stringify({ id: `s${i + 1}`, start: pos, end: pos + t.length, ...fields, text: t }));
    pos += t.length + 2;
  });
  writeFileSync(join(dir, path), text);
  writeFileSync(join(dir, `${path}.segments.jsonl`), `${lines.join("\n")}\n`);
  return text;
}

// A fresh copy of the fixture. With `paragraphs`, m1 is re-marked from them first. Returns the dir,
// the spec path, a draft path inside the copy, and the loaded spec.
export function workspace(paragraphs, prefix = "hs-station-") {
  const dir = tempDir(prefix);
  cpSync(FIXTURE, dir, { recursive: true });
  if (paragraphs) markMaterial(dir, paragraphs);
  const specPath = join(dir, "spec.md");
  return { dir, specPath, draftPath: join(dir, "draft.md"), spec: loadSpec(specPath) };
}

// The draft object src/check.mjs builds (lines stripped of a trailing \r, the way check.mjs does).
export function draftOf(text) {
  return { path: "draft.md", text, lines: text.split("\n").map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l)), sha256: "" };
}

export const crlf = (text) => text.replace(/\r?\n/g, "\r\n");
