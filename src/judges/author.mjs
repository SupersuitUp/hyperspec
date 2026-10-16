// The author: a judge who knows the author only from their AUTHOR.md (who they are, what they
// believe, why they write, how they sound) reads the draft and says whether a reader who loves this
// author would recognize them in it, marking every passage that is not them. It is blind by
// construction: the packet holds the AUTHOR.md and the draft and nothing else, no rules, no
// interview, no other judge's view, so it answers the human question the rules cannot ("does this
// sound like them?") rather than re-running the checks. hyperspec writes the packet, checks every
// quoted span against the draft (src/judge.mjs's evidence rule) and derives the status: pass when
// the author is recognizable. A passage that is not them is a warning, not a failure: it is where to
// look first, and a draft can be them with one sentence that is not.
//
// The AUTHOR.md is writing.persona.author_file, relative to the spec. It is neither the spec nor the
// draft, so the station names it in inputSources: an AUTHOR.md changed after prepare makes the
// packet stale, not altered. Declared but unreadable skips the station, for the same reason.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { str } from "../placeholder.mjs";

export const name = "author";

// The rubric is fixed: the question is the same for every author, and only the author changes.
export const AUTHOR_RUBRIC = "a reader who loves this author would recognize them in the draft";

export const AUTHOR_INSTRUCTIONS = [
  "inputs.author is the author's AUTHOR.md: who they are, what they believe, why they write, and how they sound. Read it as someone who has read everything they ever wrote and loves it.",
  "Then read inputs.draft and decide whether that reader would recognize this author in it (recognizable), and say why in a sentence or two.",
  "For every passage that is not them (the generic, plausible version of them; a belief, a move or a tone they would not have; a sentence any writer could have written), add an entry to not_them: the passage as evidence, copied verbatim from inputs.draft, at least three whole words, and why.",
  "If every passage is them, not_them is an empty list.",
  "Answer only in the verdict shape given in verdict_schema.",
].join(" ");

const isObject = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const nonEmpty = (v) => typeof v === "string" && v.trim().length > 0;

// { path, text } for writing.persona.author_file, text null when unreadable; null when none is declared.
export function readAuthorFile(spec) {
  const path = str(spec.data?.writing?.persona?.author_file);
  if (!path) return null;
  try { return { path, text: readFileSync(resolve(spec.dir || ".", path), "utf8").replace(/^﻿/, "") }; }
  catch { return { path, text: null }; }
}

const fileSkip = (path) => `writing.persona.author_file "${path}" cannot be read (run \`hyperspec lint\` for details)`;

// null when the author applies: a persona block naming an AUTHOR.md that can be read.
export function skipReason(spec) {
  const persona = spec.data?.writing?.persona;
  if (!isObject(persona)) return "writing.persona is not written (deferred)";
  const file = readAuthorFile(spec);
  if (!file) return "writing.persona.author_file is not set";
  return file.text === null ? fileSkip(file.path) : null;
}

// The skip reason when the station skips because its AUTHOR.md cannot be read, else null.
export function sourceSkip(spec) {
  const file = readAuthorFile(spec);
  return file && file.text === null ? fileSkip(file.path) : null;
}

export function inputSources(spec) {
  const file = readAuthorFile(spec);
  return file ? `the author file (${file.path})` : null;
}

// The packet: the fixed rubric, the AUTHOR.md and the draft, and the verdict schema. No answer key.
export function packet(spec, draft) {
  return {
    rubric: AUTHOR_RUBRIC,
    inputs: { author: readAuthorFile(spec).text, draft: draft.text },
    verdict_schema: {
      type: "object",
      required: ["recognizable", "why", "not_them"],
      properties: {
        recognizable: { type: "boolean", description: "whether a reader who loves this author would recognize them in the draft" },
        why: { type: "string", description: "why, in a sentence or two" },
        not_them: {
          type: "array",
          description: "every passage that is not this author; empty when every passage is them",
          items: {
            type: "object",
            required: ["evidence", "why"],
            properties: {
              evidence: { type: "string", description: "the passage, copied verbatim from the draft, at least three words" },
              why: { type: "string" },
            },
          },
        },
      },
    },
    key: null,
  };
}

// Every problem with the verdict, as findings; every evidence span must be in the draft.
export function validate(verdict, pkt, t) {
  if (!isObject(verdict)) return [t.shape("the verdict is not a JSON object", "Write one object: { recognizable, why, not_them }.")];
  const out = [];
  if (typeof verdict.recognizable !== "boolean") out.push(t.shape("recognizable is missing or not true or false", "Set recognizable to the JSON boolean true or false."));
  if (!nonEmpty(verdict.why)) out.push(t.shape("why is missing or empty", "Say why, in a sentence or two."));
  if (!Array.isArray(verdict.not_them)) out.push(t.shape("not_them is missing or not a list", "Give not_them: one { evidence, why } per passage that is not this author, or []."));
  else verdict.not_them.forEach((p, i) => {
    const at = `not_them[${i}]`;
    if (!isObject(p)) { out.push(t.shape(`${at} is not an object`, "Write it as { evidence, why }.")); return; }
    if (!nonEmpty(p.why)) out.push(t.shape(`${at}.why is missing or empty`, "Say why, in a sentence."));
    out.push(...t.evidence(p.evidence, `${at}.evidence`));
  });
  return out;
}

// Passes when the author is recognizable; each passage that is not them is a warning at its line.
export function derive(verdict, pkt, t) {
  const findings = verdict.not_them.map((p) => ({
    ...t.finding("judge-author-not-them", `this passage is not the author: ${p.why.trim()}`, "Revise the passage into something this author would write, or cut it.", t.lineOf(p.evidence)),
    severity: "warn",
  }));
  if (!verdict.recognizable) {
    findings.push(t.finding("judge-author-unrecognized", `a reader who loves this author would not recognize them: ${verdict.why.trim()}`, "Revise the draft toward the author's AUTHOR.md (their beliefs, their moves, how reading them feels), then prepare and judge again."));
  }
  return { status: verdict.recognizable ? "pass" : "fail", findings };
}
