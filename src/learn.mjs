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
import { hashMismatchMessage } from "./judge.mjs";

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
  "A hunk never crosses a paragraph or a heading; its sentences field counts the sentences it touched.",
  "Name only a block listed in blocks. Answer only in the verdict shape given in verdict_schema: one entry per hunk id, each exactly once, with a why saying what the block should have said, or why no block could have.",
].join(" ");

const present = (v) => typeof v === "string" && v.trim().length > 0;
const isObject = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// ---- the diff ----------------------------------------------------------------------------------

// The most cells the LCS table may have (rulings R20): past it, prepare refuses with a usage error
// rather than allocate gigabytes. The common start and end of the two drafts are trimmed first, so
// only the span that actually differs counts.
export const MAX_DIFF_CELLS = 10_000_000;

// Thrown by diffSentences when the differing span is too large to diff; prepare and record turn it
// into a usage error (exit 2) naming both sentence counts.
export class DiffTooLarge extends Error {
  constructor(firstCount, approvedCount) {
    super(`the drafts differ over ${firstCount} sentences of the first draft against ${approvedCount} of the approved draft (after their common start and end), more than learn diffs at once (${MAX_DIFF_CELLS.toLocaleString("en-US")} comparisons); learn from a smaller pair, a chapter or a scene at a time`);
    this.firstCount = firstCount;
    this.approvedCount = approvedCount;
  }
}

// A boundary between two units: a blank line between paragraphs, or the end of a heading that
// opens its paragraph. Boundaries are tokens in the diff, equal to one another, so the LCS anchors
// on them and no hunk crosses one (ruling R17). A heading line in the middle of a paragraph (a
// hard wrap that happens to start a line with "# ") is not a boundary, so a reflow cannot make one.
const BOUNDARY = Symbol("boundary");

function tokens(units) {
  const out = [];
  let leading = true;
  units.forEach((u, k) => {
    const prev = units[k - 1];
    if (prev) {
      if (u.para !== prev.para) { out.push({ key: BOUNDARY }); leading = true; }
      else if (prev.heading && leading) out.push({ key: BOUNDARY });
    }
    if (!u.heading) leading = false;
    out.push({ key: normalizeSentence(u.text), unit: k });
  });
  return out;
}

// diffSentences(firstText, approvedText): the edits between two drafts, as hunks in document order,
// { id: "E1", kind: "deleted" | "inserted" | "replaced", first, approved, sentences }. Units
// (src/sentences.mjs) are compared with their whitespace normalized and matched by a longest common
// subsequence, boundaries included; every maximal run of unmatched units between two matches or
// boundaries is one hunk. A hunk's texts are the drafts' own text from its first unit to its last,
// as written (null on the side that has none), and `sentences` is the larger of its two unit
// counts. A run whose two sides read the same once whitespace is normalized is a reflow, not an
// edit (ruling R18): it gets no hunk and no id. Throws DiffTooLarge past MAX_DIFF_CELLS.
export function diffSentences(firstText, approvedText) {
  const a = sentenceUnits(firstText);
  const b = sentenceUnits(approvedText);
  const ta = tokens(a);
  const tb = tokens(b);
  // Trim the common start and end: they are matches whatever the LCS says.
  let lo = 0;
  while (lo < ta.length && lo < tb.length && ta[lo].key === tb[lo].key) lo++;
  let hiA = ta.length;
  let hiB = tb.length;
  while (hiA > lo && hiB > lo && ta[hiA - 1].key === tb[hiB - 1].key) { hiA--; hiB--; }
  const n = hiA - lo;
  const m = hiB - lo;
  if ((n + 1) * (m + 1) > MAX_DIFF_CELLS) {
    const count = (t, from, to) => t.slice(from, to).filter((x) => x.key !== BOUNDARY).length;
    throw new DiffTooLarge(count(ta, lo, hiA), count(tb, lo, hiB));
  }
  // lcs[i * (m + 1) + j]: the LCS length of ta[lo + i..hiA) and tb[lo + j..hiB).
  const lcs = new Uint32Array((n + 1) * (m + 1));
  const at = (i, j) => lcs[i * (m + 1) + j];
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * (m + 1) + j] = ta[lo + i].key === tb[lo + j].key ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }

  const hunks = [];
  let run = { a: [], b: [] };
  const slice = (units, text, ks) => (ks.length ? text.slice(units[ks[0]].start, units[ks.at(-1)].end) : null);
  const close = () => {
    const first = slice(a, firstText, run.a);
    const approved = slice(b, approvedText, run.b);
    const sentences = Math.max(run.a.length, run.b.length);
    run = { a: [], b: [] };
    if (first === null && approved === null) return;
    if (first !== null && approved !== null && normalizeSentence(first) === normalizeSentence(approved)) return;
    hunks.push({
      id: `E${hunks.length + 1}`,
      kind: first === null ? "inserted" : approved === null ? "deleted" : "replaced",
      first,
      approved,
      sentences,
    });
  };
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && ta[lo + i].key === tb[lo + j].key) { close(); i++; j++; continue; }
    if (j >= m || (i < n && at(i + 1, j) >= at(i, j + 1))) {
      const t = ta[lo + i++];
      if (t.key === BOUNDARY) close(); else run.a.push(t.unit);
    } else {
      const t = tb[lo + j++];
      if (t.key === BOUNDARY) close(); else run.b.push(t.unit);
    }
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

  let built;
  try { built = buildPacket(specPathArg, spec, specSha, first, approved); }
  catch (e) { if (e instanceof DiffTooLarge) return { usage: true, error: e.message }; throw e; }
  const { packet, packetBytes } = built;
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
    summary: n ? `${plural(n, "edit")} over ${plural(packet.hunks.reduce((sum, h) => sum + h.sentences, 0), "sentence")}: ${kindCounts(packet.hunks)}` : `no edits: ${NOTHING}; nothing to learn`,
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

// { block: { edits, sentences } } for the blocks named (sentences: the sum of each hunk's sentence
// count), most sentences first, then most edits, then LEARN_BLOCKS order (ruling R17: a rewritten
// paragraph is one edit of many sentences, and weighs as the sentences it rewrote).
function tallyOf(edits, hunks) {
  const size = new Map(hunks.map((h) => [h.id, h.sentences]));
  const counts = new Map();
  for (const e of edits) {
    const c = counts.get(e.block) ?? { edits: 0, sentences: 0 };
    c.edits += 1;
    c.sentences += size.get(e.id);
    counts.set(e.block, c);
  }
  return Object.fromEntries([...counts].sort((x, y) => y[1].sentences - x[1].sentences || y[1].edits - x[1].edits || LEARN_BLOCKS.indexOf(x[0]) - LEARN_BLOCKS.indexOf(y[0])));
}

// "1 edit, 4 sentences": one block's line of the tally.
export const tallyLine = (c) => `${plural(c.edits, "edit")}, ${plural(c.sentences, "sentence")}`;

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
  // longer exist: say which file no longer matches, claiming neither cause (ruling R21).
  const specSha = sha256(readFileSync(resolve(packet.spec)));
  const changed = [
    specSha !== packet.spec_sha256 && "the spec",
    first.sha256 !== packet.first_sha256 && "the first draft",
    approved.sha256 !== packet.approved_sha256 && "the approved draft",
  ].filter(Boolean);
  if (changed.length) {
    return refuse(finding("learn-stale", hashMismatchMessage(changed), "Run learn prepare again (with --force) and classify the new packet."), { stale: true });
  }

  // Never trust the packet file: rebuild it and require these exact bytes, then validate against
  // the rebuilt copy only.
  let built;
  try { built = buildPacket(packet.spec, spec, specSha, first, approved); }
  catch (e) { if (e instanceof DiffTooLarge) return { usage: true, error: e.message }; throw e; }
  const { packet: rebuilt, packetBytes } = built;
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
  const sentences = rebuilt.hunks.reduce((sum, h) => sum + h.sentences, 0);
  const tally = tallyOf(verdictJson.edits, rebuilt.hunks);
  const counts = Object.entries(tally).map(([b, c]) => `${b} ${plural(c.edits, "edit")} (${plural(c.sentences, "sentence")})`).join(", ");
  const top = Object.entries(tally).find(([b]) => b !== "none");
  const suggestion = top ? { block: top[0], edits: top[1].edits, sentences: top[1].sentences, move: LEARN_MOVES[top[0]] } : null;
  // "none" means no block of the spec could have prevented the edit (the packet's instructions),
  // so a verdict of nothing but none leaves the spec nothing to learn (ruling R19).
  const NOTHING_TO_LEARN = "no block could have prevented any edit, so the spec has nothing to learn from this pair";
  const next = suggestion
    ? `${suggestion.block}, ${suggestion.sentences} of ${plural(sentences, "sentence")} (${suggestion.edits} of ${plural(edits, "edit")}): ${suggestion.move}`
    : edits ? `none; ${NOTHING_TO_LEARN}` : `none; ${NOTHING}, so there is nothing to learn`;
  // The spec is the one the edits were classified against (a changed spec is stale, above), and
  // learn never edits it: every count naming a block is an edit the spec does not yet prevent.
  const reason = !edits ? `no edits: ${NOTHING}` : `edits by block: ${counts}; ${suggestion ? "not yet applied to the spec" : NOTHING_TO_LEARN}`;

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

  return { ...base, ok: true, edits, sentences, tally, suggestion, next, verdict: ledger && !ledger.warning ? "not-improved" : null, reason, ledgerPath, ledgerWarning, code: 0 };
}
