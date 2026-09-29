// `hyperspec learn prepare` and `hyperspec learn record`: the Learn stage. A factory wrote a first
// draft; a person edited it into the draft they approved. Every edit is something the spec did not
// say well enough, or at all. `prepare` diffs the two drafts sentence by sentence and writes a
// PACKET: each edit as a hunk (E1..En), the spec's block names, fixed instructions and the verdict
// shape. An outside judge, a person or a model, names for each hunk the one block that should have
// prevented it. `record` validates that verdict, tallies it by block, names ONE next move for the
// block with the most edits, and appends a ledger line. hyperspec never calls a model, and learn
// never edits the spec: the move is a suggestion for whoever maintains it.
//
// The judge packets (src/judge.mjs) set the rules followed here: paths kept as given so the packet
// is byte-identical on rerun, and record never trusts the packet file: it rebuilds the packet from
// the files on disk and requires the file to be exactly those bytes.

import { appendFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { sha256 } from "./hash.mjs";
import { writeFileAtomic } from "./fsutil.mjs";
import { readDraft } from "./draft.mjs";
import { loadWritingSpec, lintBlock } from "./check.mjs";
import { openLedger, ledgerDraftKey } from "./ledger.mjs";
import { BLOCKS, blockPresent } from "./writing.mjs";
import { sentenceUnits, normalizeSentence } from "./sentences.mjs";
import { truncate } from "./stations/util.mjs";

export const LEARN_VERSION = "0.1";
export const PACKET_NAME = "learn.packet.json";

// The closed list a verdict names blocks from, in the order every tally breaks ties by: the nine
// writing blocks in schema order, then "none" (no block of the spec could have prevented the edit).
export const LEARN_BLOCKS = Object.freeze([...BLOCKS, "none"]);

// The one next move per block, suggested for the block with the most edits. "none" has no move.
export const LEARN_MOVES = Object.freeze({
  materials: "mark or add the material the edit drew on",
  dna: "add a golden or a style rule",
  persona: "tighten the persona's stance, may_assert or will_not_say",
  audience: "extend the audience's knows or terms",
  goal: "tighten a goal condition's fails_when",
  form: "adjust the form block's length or shape",
  spine: "restate the spine's claim or its order",
  sources: "add or cite a source in the claims ledger",
  characters: "extend a character's speech or knowledge",
});

export const LEARN_INSTRUCTIONS = [
  "Each hunk is one edit a person made between the first draft a factory produced (first) and the draft they approved (approved): deleted (only in first), inserted (only in approved) or replaced (first became approved).",
  "For every hunk, name the one block of the spec (read it at the spec path) that, had it said more or said it better, would have had the factory write the approved text in the first place:",
  "materials (the source material the text drew on), dna (the writer's voice: goldens and style rules), persona (who is speaking: stance, what they may assert, what they will not say), audience (the reader: what they know, the terms they use), goal (the change the draft must produce and its conditions), form (length and shape), spine (the claims and their order), sources (the claims ledger), characters (fiction: a character's speech or knowledge),",
  "or none when no block of the spec could have prevented it.",
  "Name only a block listed in blocks. Answer only in the verdict shape given in verdict_schema: one entry per hunk id, each exactly once, with a why saying what the block should have said, or why no block could have.",
].join(" ");

const present = (v) => typeof v === "string" && v.trim().length > 0;
const isObject = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);

// ---- the diff ----------------------------------------------------------------------------------

// diffSentences(firstText, approvedText): the edits between two drafts, as hunks in document order,
// { id: "E1", kind: "deleted" | "inserted" | "replaced", first, approved }. Units (src/sentences.mjs)
// are compared with their whitespace normalized, and matched by a longest common subsequence; every
// maximal run of units outside it is one hunk. A hunk's texts are the drafts' own text from its
// first unit to its last, as written (null on the side that has none).
export function diffSentences(firstText, approvedText) {
  const a = sentenceUnits(firstText);
  const b = sentenceUnits(approvedText);
  const na = a.map((u) => normalizeSentence(u.text));
  const nb = b.map((u) => normalizeSentence(u.text));
  const n = a.length;
  const m = b.length;
  // lcs[i * (m + 1) + j]: the LCS length of na[i..] and nb[j..].
  const lcs = new Uint32Array((n + 1) * (m + 1));
  const at = (i, j) => lcs[i * (m + 1) + j];
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * (m + 1) + j] = na[i] === nb[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }
  const hunks = [];
  let run = null;
  const close = () => {
    if (!run) return;
    const text = (units, text, lo, hi) => (lo < hi ? text.slice(units[lo].start, units[hi - 1].end) : null);
    const first = text(a, firstText, run.i0, run.i1);
    const approved = text(b, approvedText, run.j0, run.j1);
    hunks.push({ id: `E${hunks.length + 1}`, kind: first === null ? "inserted" : approved === null ? "deleted" : "replaced", first, approved });
    run = null;
  };
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && na[i] === nb[j]) { close(); i++; j++; continue; }
    if (!run) run = { i0: i, i1: i, j0: j, j1: j };
    if (j >= m || (i < n && at(i + 1, j) >= at(i, j + 1))) run.i1 = ++i;
    else run.j1 = ++j;
  }
  close();
  return hunks;
}

// ---- the packet --------------------------------------------------------------------------------

// The blocks a verdict may name for this spec: each writing block the spec has written, in schema
// order, then "none". A deferred or absent block (characters outside fiction) is not listed.
export function specBlocks(spec) {
  const writing = isObject(spec.data?.writing) ? spec.data.writing : {};
  return [...BLOCKS.filter((b) => blockPresent(b, writing[b])), "none"];
}

const packetJson = (packet) => `${JSON.stringify(packet, null, 2)}\n`;

// The packet for this spec and these two drafts, built the one way both commands build it.
function buildPacket(specPathArg, spec, specSha, first, approved) {
  const hunks = diffSentences(first.text, approved.text);
  const blocks = specBlocks(spec);
  const packet = {
    hyperspec_learn: LEARN_VERSION,
    spec: specPathArg,
    spec_sha256: specSha,
    first: first.path,
    first_sha256: first.sha256,
    approved: approved.path,
    approved_sha256: approved.sha256,
    blocks,
    instructions: LEARN_INSTRUCTIONS,
    hunks,
    verdict_schema: {
      type: "object",
      required: ["edits"],
      properties: {
        edits: {
          type: "array",
          description: "one entry per hunk id, each exactly once",
          items: {
            type: "object",
            required: ["id", "block", "why"],
            properties: {
              id: { enum: hunks.map((h) => h.id) },
              block: { enum: blocks },
              why: { type: "string", description: "what the block should have said to prevent this edit, or why no block could have" },
            },
          },
        },
      },
    },
  };
  return { packet, packetBytes: packetJson(packet) };
}

// "2 replaced, 1 deleted, 1 inserted": the kinds present, most first, ties in that fixed order.
function kindCounts(hunks) {
  const order = ["replaced", "deleted", "inserted"];
  return order
    .map((k) => [k, hunks.filter((h) => h.kind === k).length])
    .filter(([, c]) => c > 0)
    .sort((x, y) => y[1] - x[1] || order.indexOf(x[0]) - order.indexOf(y[0]))
    .map(([k, c]) => `${c} ${k}`)
    .join(", ");
}

const NOTHING = "the first draft and the approved draft match";

// prepareLearn(specPathArg, { first, approved, out, force }): writes <out>/learn.packet.json.
export function prepareLearn(specPathArg, { first: firstArg, approved: approvedArg, out: outDirArg, force = false } = {}) {
  if (!present(specPathArg)) return { usage: true, error: "learn prepare needs a spec path" };
  if (!present(firstArg)) return { usage: true, error: "learn prepare needs --first <draft>" };
  if (!present(approvedArg)) return { usage: true, error: "learn prepare needs --approved <draft>" };
  if (!present(outDirArg)) return { usage: true, error: "learn prepare needs --out <dir>" };

  const loaded = loadWritingSpec(specPathArg, "learn prepare");
  if (loaded.usage) return loaded;
  const { spec } = loaded;

  let outStat = null;
  try { outStat = statSync(resolve(outDirArg)); } catch { /* reported below */ }
  if (!outStat) return { usage: true, error: `--out folder does not exist: ${outDirArg}; create it first` };
  if (!outStat.isDirectory()) return { usage: true, error: `--out is not a folder: ${outDirArg}` };

  const blocked = lintBlock(spec, specPathArg);
  if (blocked) return blocked;

  const first = readDraft(firstArg);
  if (!first) return { usage: true, error: `cannot read the first draft: ${firstArg}` };
  const approved = readDraft(approvedArg);
  if (!approved) return { usage: true, error: `cannot read the approved draft: ${approvedArg}` };
  const specSha = sha256(readFileSync(resolve(specPathArg)));

  const { packet, packetBytes } = buildPacket(specPathArg, spec, specSha, first, approved);
  const path = join(outDirArg, PACKET_NAME);
  if (existsSync(resolve(path)) && !force) return { usage: true, error: `refusing to overwrite ${path}; pass --force to replace it` };
  writeFileAtomic(resolve(path), packetBytes);

  const n = packet.hunks.length;
  return {
    ok: true,
    specPath: specPathArg,
    path,
    edits: n,
    kinds: Object.fromEntries(["replaced", "deleted", "inserted"].map((k) => [k, packet.hunks.filter((h) => h.kind === k).length])),
    summary: n ? `${n} edit${n === 1 ? "" : "s"}: ${kindCounts(packet.hunks)}` : `no edits: ${NOTHING}; nothing to learn`,
    code: 0,
  };
}

// ---- record ------------------------------------------------------------------------------------

const finding = (id, message, fix) => ({ station: "learn", id, severity: "fail", message, fix });
const shape = (message) => finding("learn-verdict-shape", message, "Write one object: { edits: [{ id, block, why }] }, one entry per hunk id.");

// Every problem with the verdict against the rebuilt packet; [] when it is valid.
function validate(verdict, packet) {
  if (!isObject(verdict)) return [shape("the verdict is not a JSON object")];
  if (!Array.isArray(verdict.edits)) return [shape("edits is missing or not a list")];
  const out = [];
  const ids = packet.hunks.map((h) => h.id);
  const seen = new Set();
  const dup = new Set();
  verdict.edits.forEach((e, i) => {
    if (!isObject(e)) { out.push(shape(`edits[${i}] is not an object`)); return; }
    if (!present(e.id)) { out.push(shape(`edits[${i}].id is missing or not a string`)); return; }
    const id = e.id;
    if (!ids.includes(id)) out.push(finding("learn-edit-unknown", `${id} is not a hunk in the packet (hunks: ${ids.join(", ") || "none"})`, "Classify only the packet's hunks, by their ids."));
    else if (seen.has(id)) { if (!dup.has(id)) out.push(finding("learn-edit-duplicate", `${id} is classified more than once`, "Classify each hunk exactly once.")); dup.add(id); }
    seen.add(id);
    if (typeof e.block !== "string" || !LEARN_BLOCKS.includes(e.block)) {
      out.push(finding("learn-block-unknown", `${id}: block ${JSON.stringify(e.block ?? null)} is not one of ${LEARN_BLOCKS.join(", ")}`, "Name one block from the closed list, or none."));
    } else if (!packet.blocks.includes(e.block)) {
      out.push(finding("learn-block-absent", `${id}: the spec has no ${e.block} block`, `Name a block the spec has (${packet.blocks.join(", ")}).`));
    }
    if (!present(e.why)) out.push(finding("learn-why-missing", `${id}: why is empty or not a string`, "Say what the block should have said to prevent the edit, or why no block could have."));
  });
  for (const id of ids) {
    if (!seen.has(id)) out.push(finding("learn-edit-missing", `${id} is not classified`, "Give every hunk in the packet exactly one entry."));
  }
  return out;
}

// { block: count } for the blocks named, most edits first, ties in LEARN_BLOCKS order.
function tallyOf(edits) {
  const counts = new Map();
  for (const e of edits) counts.set(e.block, (counts.get(e.block) ?? 0) + 1);
  return Object.fromEntries([...counts].sort((x, y) => y[1] - x[1] || LEARN_BLOCKS.indexOf(x[0]) - LEARN_BLOCKS.indexOf(y[0])));
}

// recordLearn(packetPathArg, verdictPathArg): usage (exit 2); { invalid } (exit 1, nothing
// appended; also { stale } when a file changed since prepare); or the recorded result (exit 0).
export function recordLearn(packetPathArg, verdictPathArg) {
  if (!present(packetPathArg)) return { usage: true, error: "learn record needs a packet path" };
  if (!present(verdictPathArg)) return { usage: true, error: "learn record needs --verdict <file>" };

  let packetText;
  try { packetText = readFileSync(resolve(packetPathArg), "utf8"); }
  catch { return { usage: true, error: `cannot read packet: ${packetPathArg}` }; }
  let packet;
  try { packet = JSON.parse(packetText); } catch { packet = null; }
  if (!isObject(packet) || packet.hyperspec_learn !== LEARN_VERSION || !present(packet.spec) || !present(packet.first) || !present(packet.approved)) {
    return { usage: true, error: `not a hyperspec learn packet: ${packetPathArg}` };
  }

  let verdictBuf;
  try { verdictBuf = readFileSync(resolve(verdictPathArg)); }
  catch { return { usage: true, error: `cannot read verdict: ${verdictPathArg}` }; }

  const loaded = loadWritingSpec(packet.spec, "learn record");
  if (loaded.usage) return { usage: true, error: `the packet's spec: ${loaded.error}` };
  const { spec } = loaded;
  const first = readDraft(packet.first);
  if (!first) return { usage: true, error: `cannot read the packet's first draft: ${packet.first}` };
  const approved = readDraft(packet.approved);
  if (!approved) return { usage: true, error: `cannot read the packet's approved draft: ${packet.approved}` };

  const base = { packetPath: packetPathArg, verdictPath: verdictPathArg };
  const refuse = (f, extra = {}) => ({ ...base, ok: false, invalid: true, ...extra, findings: [f], code: 1 });

  // A verdict on bytes other than the ones the packet was built from classifies edits that no
  // longer exist: say which file changed.
  const specSha = sha256(readFileSync(resolve(packet.spec)));
  const changed = [
    specSha !== packet.spec_sha256 && "the spec",
    first.sha256 !== packet.first_sha256 && "the first draft",
    approved.sha256 !== packet.approved_sha256 && "the approved draft",
  ].filter(Boolean);
  if (changed.length) {
    const what = changed.length === 1 ? changed[0] : `${changed.slice(0, -1).join(", ")} and ${changed.at(-1)}`;
    return refuse(finding("learn-stale", `${what} changed since the packet was prepared`, "Run learn prepare again (with --force) and classify the new packet."), { stale: true });
  }

  // Never trust the packet file: rebuild it and require these exact bytes, then validate against
  // the rebuilt copy only.
  const { packet: rebuilt, packetBytes } = buildPacket(packet.spec, spec, specSha, first, approved);
  if (packetBytes !== packetText) {
    return refuse(finding("learn-packet-altered", `${packetPathArg} is not the packet learn prepare builds from the spec and drafts on disk`, "Run learn prepare again (with --force) and classify the new packet; never edit a packet."));
  }

  let verdictJson;
  try { verdictJson = JSON.parse(verdictBuf.toString("utf8").replace(/^﻿/, "")); }
  catch (e) {
    return refuse(finding("learn-verdict-not-json", `the verdict is not valid JSON (${truncate(e instanceof Error ? e.message : String(e), 120)})`, "Write the verdict as one JSON object in the packet's verdict_schema shape."));
  }
  const problems = validate(verdictJson, rebuilt);
  if (problems.length) return { ...base, ok: false, invalid: true, findings: problems, code: 1 };

  const edits = verdictJson.edits.length;
  const tally = tallyOf(verdictJson.edits);
  const counts = Object.entries(tally).map(([b, c]) => `${b} ${c}`).join(", ");
  const top = Object.entries(tally).find(([b]) => b !== "none");
  const suggestion = top ? { block: top[0], count: top[1], move: LEARN_MOVES[top[0]] } : null;
  const next = suggestion
    ? `${suggestion.block}, ${suggestion.count} of ${edits} edit${edits === 1 ? "" : "s"}: ${suggestion.move}`
    : edits ? "none; every edit is none: the spec explained every edit" : `none; ${NOTHING}, so there is nothing to learn`;
  // The spec is the one the edits were classified against (a changed spec is stale, above), and
  // learn never edits it: every count is an edit the spec does not yet prevent.
  const reason = edits ? `edits by block: ${counts}; not yet applied to the spec` : `no edits: ${NOTHING}`;

  let ledgerPath = null;
  let ledgerWarning = null;
  const ledger = openLedger(spec);
  if (ledger?.warning) ledgerWarning = ledger.warning;
  else if (ledger) {
    const line = {
      at: new Date().toISOString(),
      kind: "learn",
      first: ledgerDraftKey(spec.dir, packet.first),
      first_sha256: first.sha256,
      approved: ledgerDraftKey(spec.dir, packet.approved),
      approved_sha256: approved.sha256,
      spec_sha256: specSha,
      verdict: "not-improved",
      reason,
      tally,
    };
    appendFileSync(ledger.abs, `${JSON.stringify(line)}\n`);
    ledgerPath = ledger.decl;
  }

  return { ...base, ok: true, edits, tally, suggestion, next, verdict: ledger && !ledger.warning ? "not-improved" : null, reason, ledgerPath, ledgerWarning, code: 0 };
}
