// Scoped writer DNA (hyperspec 0.5). A writer does not have one voice: the same person writes
// differently for a theology journal and a landing page, so their DNA is kept per SCOPE (form,
// audience, purpose) as a folder of goldens, real passages a human approved, each carrying a note
// on why it is golden. This module never judges a passage and never calls a model: it reads a
// scope, checks the closed set of required fields on each golden (findings, in the lint shape),
// and measures a scope's style features deterministically from its goldens' text. Whether a
// generated passage matches those features is a later build's job (a station); this module only
// reads and counts.
//
// A scope is a folder: <dir>/scope.md (frontmatter writer, form, audience, purpose, optional
// notes) and <dir>/goldens/*.md, one golden per file (frontmatter why, approved_by, source,
// optional approved_on; the body is the passage, verbatim). readScope reads both and returns
// everything downstream code needs: the scope's own fields, every golden's data, and every
// finding, in one pass. readGoldens is the goldens-only half, exported on its own because a
// caller that already has the scope's fields (or does not need them) can read just the goldens.
//
// Sentence and paragraph splitting reuse splitSegments from segments.mjs (paragraph mode for
// paragraphs, sentence mode within each paragraph for sentences), so a golden's paragraph count
// and its sentence count are never two different notions of where a boundary falls.

import { readFileSync, readdirSync, realpathSync } from "node:fs";
import { join, relative } from "node:path";
import { parseSkillFile } from "@supersuit/superskill/yaml";
import { sha256 } from "./hash.mjs";
import { splitSegments } from "./segments.mjs";
import { str } from "./placeholder.mjs";
import { scalar } from "./template.mjs";
import { writeFileAtomic } from "./fsutil.mjs";

const f = (test, id, severity, message, fix) => ({ test, id, severity, message, fix });

// -------------------------------------------------------------------------------------------
// reading a scope

// The golden files in <dir>/goldens/: every *.md file except README.md (case-insensitive),
// which is the guidance file `dna init` writes into an otherwise-empty goldens/ folder. Sorted
// by filename, so golden order (and therefore features.json's goldens list and word pooling
// order) never depends on the filesystem's own directory-listing order.
// isGoldenFileName is the one definition of which names in goldens/ are goldens, shared with the
// spec linter, which refuses a listed golden the reader would never read.
export function isGoldenFileName(name) {
  const lower = String(name).toLowerCase();
  return lower.endsWith(".md") && lower !== "readme.md";
}

function listGoldenFiles(goldensDir) {
  return readdirSync(goldensDir, { withFileTypes: true })
    .filter((e) => e.isFile() && isGoldenFileName(e.name))
    .map((e) => e.name)
    .sort();
}

// The folder a scope's goldens really live in, when <dir>/goldens resolves somewhere else: a
// goldens/ folder that is a symlink (to another scope's goldens, say) would otherwise carry that
// scope's passages into this one under this scope's name. Returned relative to the scope's own
// real folder, so a message built from it never names a folder on this machine. null when the
// folder is where it should be, or cannot be resolved at all (a missing folder is reported as
// goldens-missing by the listing below).
function goldensElsewhere(dir) {
  try {
    const dirReal = realpathSync(dir);
    const goldensReal = realpathSync(join(dir, "goldens"));
    return goldensReal === join(dirReal, "goldens") ? null : relative(dirReal, goldensReal);
  } catch {
    return null;
  }
}

// readGoldens(dir): reads <dir>/goldens/*.md. Returns { goldens, findings }. Every finding is in
// the lint shape (test, id, severity, message, fix), ids prefixed writing-dna-, messages naming
// the scope dir (displayDir, defaulting to dir itself) and the golden file (its path relative to
// dir, e.g. "goldens/opening.md"). A golden with a missing required field is still returned in
// goldens (so a caller can see what IS there); only a golden this function cannot even read
// (an fs error) is left out, since there is nothing to return for it.
export function readGoldens(dir, { displayDir } = {}) {
  const shown = displayDir ?? dir;
  const goldensDir = join(dir, "goldens");
  const findings = [];

  const elsewhere = goldensElsewhere(dir);
  if (elsewhere !== null) {
    findings.push(f(5, "writing-dna-goldens-outside", "fail",
      `scope "${shown}": its goldens/ folder resolves to ${elsewhere}, outside the scope; a golden feeds only work that shares its scope`,
      `Replace ${shown}/goldens with a real folder holding this scope's own goldens, copying in any passage that belongs to this scope too.`));
    return { goldens: [], findings };
  }

  let names;
  try {
    names = listGoldenFiles(goldensDir);
  } catch {
    findings.push(f(1, "writing-dna-goldens-missing", "fail",
      `scope "${shown}": goldens folder "goldens/" does not exist or cannot be read`,
      `Run \`hyperspec dna init ${shown} --writer W --form F --audience A --purpose P\`, or create goldens/ yourself.`));
    return { goldens: [], findings };
  }

  if (names.length === 0) {
    findings.push(f(1, "writing-dna-goldens-empty", "fail",
      `scope "${shown}" has no goldens in goldens/`,
      "Add at least one golden file under goldens/."));
    return { goldens: [], findings };
  }

  const goldens = [];
  for (const name of names) {
    const relPath = `goldens/${name}`;
    let buf;
    try {
      buf = readFileSync(join(goldensDir, name));
    } catch {
      findings.push(f(1, "writing-dna-golden-unreadable", "fail",
        `scope "${shown}", golden "${relPath}" cannot be read`,
        `Fix or remove ${relPath}.`));
      continue;
    }

    const sha = sha256(buf);
    // parseSkillFile never throws: malformed or missing frontmatter comes back as data: {} (and,
    // for missing frontmatter, the whole file as body), so every required field below is simply
    // reported missing rather than needing a separate "malformed" finding. The one exception is
    // frontmatter that OPENS (a first line of ---) and never closes: parseSkillFile has nowhere to
    // end the block, so body comes back empty and the real passage text is invisible, meaning the
    // three field checks below and golden-empty would all fire for what is one defect. So report
    // that once, plainly, instead of a cascade that reads like four unrelated problems.
    const { data, body, error } = parseSkillFile(buf.toString("utf8"));
    if (error === "unterminated frontmatter") {
      findings.push(f(1, "writing-dna-golden-frontmatter", "fail",
        `scope "${shown}", golden "${relPath}"'s frontmatter opens with --- but never closes`,
        `Close ${relPath}'s frontmatter with a second --- line.`));
      continue;
    }
    const why = str(data.why);
    const approvedBy = str(data.approved_by);
    const source = str(data.source);
    const approvedOn = str(data.approved_on);
    // "The body is the passage, verbatim": trimmed only to drop the one blank line every golden
    // carries between its closing "---" and the first line of the passage, never touched inside.
    const text = body.trim();

    if (!text) {
      findings.push(f(1, "writing-dna-golden-empty", "fail",
        `scope "${shown}", golden "${relPath}" has no passage text`,
        "Add the passage as the file body."));
    }
    if (!why) {
      findings.push(f(6, "writing-dna-golden-why", "fail",
        `scope "${shown}", golden "${relPath}" has no why`,
        "Add why: the move this golden teaches."));
    }
    if (!approvedBy) {
      findings.push(f(4, "writing-dna-golden-approved-by", "fail",
        `scope "${shown}", golden "${relPath}" has no approved_by`,
        "Add approved_by: the person slug who approved this passage."));
    } else if (approvedBy.toLowerCase().startsWith("agent:")) {
      findings.push(f(4, "writing-dna-golden-approved-by-agent", "fail",
        `scope "${shown}", golden "${relPath}": approved_by "${approvedBy}" is an agent; golden means a human approved it`,
        "Set approved_by: to the person slug who actually approved this passage, not an agent."));
    }
    if (!source) {
      findings.push(f(4, "writing-dna-golden-source", "fail",
        `scope "${shown}", golden "${relPath}" has no source`,
        "Add source: where this passage came from."));
    }

    goldens.push({ path: relPath, why, approved_by: approvedBy, source, approved_on: approvedOn, text, sha256: sha });
  }

  return { goldens, findings };
}

// readScope(dir): reads <dir>/scope.md and <dir>/goldens/*.md. Returns { scope, goldens,
// findings }. scope is { writer, form, audience, purpose, notes } (each a string, "" if missing
// or a placeholder), or null when scope.md itself could not be read at all. goldens and findings
// are as readGoldens above; findings from scope.md's own fields come first, then every golden's.
// displayDir overrides what messages call the scope (for a caller, e.g. the spec linter, that
// wants the scope_dir string as it was written, not a resolved filesystem path); it defaults to
// dir.
export function readScope(dir, { displayDir } = {}) {
  const shown = displayDir ?? dir;
  const findings = [];
  let scope = null;

  let raw;
  try {
    raw = readFileSync(join(dir, "scope.md"), "utf8");
  } catch {
    findings.push(f(1, "writing-dna-scope-missing", "fail",
      `scope "${shown}": scope.md does not exist or cannot be read`,
      `Run \`hyperspec dna init ${shown} --writer W --form F --audience A --purpose P\` to create it.`));
  }

  if (raw !== undefined) {
    const { data, error } = parseSkillFile(raw);
    if (error) {
      findings.push(f(1, "writing-dna-scope-missing", "fail",
        `scope "${shown}": scope.md is not valid (${error})`,
        "Fix scope.md's frontmatter: writer, form, audience, purpose."));
    } else {
      const writer = str(data.writer);
      const form = str(data.form);
      const audience = str(data.audience);
      const purpose = str(data.purpose);
      scope = { writer, form, audience, purpose, notes: str(data.notes) };
      for (const [field, value] of [["writer", writer], ["form", form], ["audience", audience], ["purpose", purpose]]) {
        if (!value) {
          findings.push(f(1, `writing-dna-scope-file-${field}`, "fail",
            `scope "${shown}": scope.md has no ${field}`,
            `Add ${field}: to scope.md.`));
        }
      }
    }
  }

  const { goldens, findings: goldenFindings } = readGoldens(dir, { displayDir: shown });
  findings.push(...goldenFindings);

  return { scope, goldens, findings };
}

// -------------------------------------------------------------------------------------------
// measuring features, from text alone: no filesystem, no judgment, fully deterministic.

// Every number this module writes is rounded the same way: half away from zero, at the 3rd
// decimal. -0 never survives (JSON.stringify(-0) already prints "0", but this also normalizes
// the in-memory number, so a strict equality check on the returned object sees +0 too).
function round3(x) {
  const r = Math.round(x * 1000) / 1000;
  return r === 0 ? 0 : r;
}

const mean = (arr) => (arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length);
function median(sortedArr) {
  const n = sortedArr.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sortedArr[mid - 1] + sortedArr[mid]) / 2 : sortedArr[mid];
}
// Nearest-rank percentile: rank = ceil(p/100 * n), 1-based, clamped to [1, n]. p90 on 10 values
// [1..10] is rank ceil(9) = 9, the 9th smallest, i.e. 9 itself; this is the "nearest rank"
// definition (not linear interpolation).
function percentileNearestRank(sortedArr, p) {
  const n = sortedArr.length;
  if (n === 0) return 0;
  const rank = Math.min(Math.max(Math.ceil((p / 100) * n), 1), n);
  return sortedArr[rank - 1];
}

// A word is a maximal run of Unicode letters, digits, and apostrophes (straight ' or curly U+2019),
// lowercased. A leading or trailing apostrophe (a quote mark hugging a word) is swept up into
// the token by this same rule; it is simply never "between letters", so it never makes the word
// count as a contraction below.
const WORD_RE = /[\p{L}\p{N}'\u2019]+/gu;
// Exported so a later reader of a whole document (the check command's "form" station counting a
// draft's words against writing.form.length) reuses this exact word definition rather than
// keeping a second one that could quietly disagree with it.
export function wordsOf(text) {
  const m = text.match(WORD_RE);
  return m ? m.map((w) => w.toLowerCase()) : [];
}

// A contraction: the word contains an apostrophe (straight or curly) with a letter immediately
// before AND after it. "don't" and "y'all's" qualify; "'tis" (apostrophe at position 0, nothing
// before it) and a stray quote-wrapped word do not.
function isContraction(word) {
  for (let i = 1; i < word.length - 1; i++) {
    const ch = word[i];
    if ((ch === "'" || ch === "\u2019") && /\p{L}/u.test(word[i - 1]) && /\p{L}/u.test(word[i + 1])) return true;
  }
  return false;
}

const FIRST_PERSON_SINGULAR = new Set(["i", "me", "my", "mine", "myself"]);
const FIRST_PERSON_PLURAL = new Set(["we", "us", "our", "ours", "ourselves"]);
const SECOND_PERSON = new Set(["you", "your", "yours", "yourself", "yourselves"]);

// A signature-word candidate: 4+ characters, letters and apostrophes only (no bare digit runs,
// so "2024" is never a signature word), and not a stopword. Frequency and the >=2 floor are
// applied afterward, over the whole scope's pooled words.
const CANDIDATE_RE = /^[\p{L}'\u2019]+$/u;
function isSignatureCandidate(word) {
  return word.length >= 4 && CANDIDATE_RE.test(word) && !STOPWORD_SET.has(word.replace(/\u2019/g, "'"));
}

function signatureWords(allWords) {
  const freq = new Map();
  for (const w of allWords) {
    if (!isSignatureCandidate(w)) continue;
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  const candidates = [...freq.entries()].filter(([, count]) => count >= 2);
  // Frequency descending; ties broken alphabetically. Plain code-point comparison, not
  // localeCompare, so the order never depends on the running Node build's ICU data.
  candidates.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return candidates.slice(0, 15).map(([w]) => w);
}

const countChar = (text, re) => (text.match(re) || []).length;

// measureFeatures(texts): texts is an array of golden passage strings (readScope's goldens[].text),
// in any order; the result does not depend on it. Pure and deterministic: the same texts
// always produce the same features object, byte for byte once JSON.stringify'd. Every rate is
// per 1000 words; every number is rounded via round3.
export function measureFeatures(texts) {
  const list = Array.isArray(texts) ? texts : [];
  const allWords = [];
  const sentenceWordCounts = [];
  const paragraphSentenceCounts = [];
  const paragraphWordCounts = [];
  let commas = 0, semicolons = 0, colons = 0, emDashes = 0, enDashes = 0;
  let exclaims = 0, questions = 0, parens = 0, quotes = 0;

  for (const raw of list) {
    const text = typeof raw === "string" ? raw : "";
    commas += countChar(text, /,/g);
    semicolons += countChar(text, /;/g);
    colons += countChar(text, /:/g);
    emDashes += countChar(text, /\u2014/g);
    enDashes += countChar(text, /\u2013/g);
    exclaims += countChar(text, /!/g);
    questions += countChar(text, /\?/g);
    parens += countChar(text, /[()]/g);
    quotes += countChar(text, /["\u201C\u201D]/g);

    const paragraphs = splitSegments(text, { by: "paragraph" }).map((s) => s.text);
    for (const paragraph of paragraphs) {
      const sentences = splitSegments(paragraph, { by: "sentence" }).map((s) => s.text);
      let paragraphWords = 0;
      for (const sentence of sentences) {
        const sWords = wordsOf(sentence);
        sentenceWordCounts.push(sWords.length);
        paragraphWords += sWords.length;
        allWords.push(...sWords);
      }
      paragraphSentenceCounts.push(sentences.length);
      paragraphWordCounts.push(paragraphWords);
    }
  }

  const totalWords = allWords.length;
  const perThousand = (count) => (totalWords === 0 ? 0 : round3((count / totalWords) * 1000));
  const sortedSentenceWords = [...sentenceWordCounts].sort((a, b) => a - b);
  const contractionCount = allWords.filter(isContraction).length;
  const fpSingular = allWords.filter((w) => FIRST_PERSON_SINGULAR.has(w)).length;
  const fpPlural = allWords.filter((w) => FIRST_PERSON_PLURAL.has(w)).length;
  const sp = allWords.filter((w) => SECOND_PERSON.has(w)).length;
  const meanWordLength = totalWords === 0 ? 0 : round3(allWords.reduce((sum, w) => sum + w.length, 0) / totalWords);

  return {
    word_count: totalWords,
    sentence_length: {
      mean: round3(mean(sentenceWordCounts)),
      median: round3(median(sortedSentenceWords)),
      p90: round3(percentileNearestRank(sortedSentenceWords, 90)),
    },
    paragraph_length: {
      mean_sentences: round3(mean(paragraphSentenceCounts)),
      mean_words: round3(mean(paragraphWordCounts)),
    },
    rates_per_1000_words: {
      comma: perThousand(commas),
      semicolon: perThousand(semicolons),
      colon: perThousand(colons),
      em_dash: perThousand(emDashes),
      en_dash: perThousand(enDashes),
      exclamation: perThousand(exclaims),
      question_mark: perThousand(questions),
      parentheses: perThousand(parens),
      quotation_marks: perThousand(quotes),
    },
    contraction_rate: perThousand(contractionCount),
    first_person_singular_rate: perThousand(fpSingular),
    first_person_plural_rate: perThousand(fpPlural),
    second_person_rate: perThousand(sp),
    mean_word_length: meanWordLength,
    signature_words: signatureWords(allWords),
  };
}

// features.json: 2-space JSON, a trailing newline, keys in the fixed order below, goldens sorted
// by path, so the same goldens always produce byte-identical bytes. DNA_FORMAT is the version of
// this shape, recorded in the file as "dna".
export const DNA_FORMAT = "0.1";

// featuresText({ scope, goldens, features }): the exact bytes writeFeatures writes, and the data
// they encode. The spec linter builds these from the scope as it reads now and compares them to
// the file, so a features.json is current only when it is what dna measure would write today.
export function featuresText({ scope, goldens, features }) {
  const sortedGoldens = [...(goldens ?? [])].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const data = {
    dna: DNA_FORMAT,
    scope: {
      writer: scope?.writer ?? "",
      form: scope?.form ?? "",
      audience: scope?.audience ?? "",
      purpose: scope?.purpose ?? "",
    },
    goldens: sortedGoldens.map((g) => ({ path: g.path, sha256: g.sha256 })),
    features,
  };
  return { data, text: `${JSON.stringify(data, null, 2)}\n` };
}

// writeFeatures(scopeDir, { scope, goldens, features }): writes <scopeDir>/features.json, the
// bytes featuresText returns. Returns { path, data }.
export function writeFeatures(scopeDir, input) {
  const { data, text } = featuresText(input);
  const path = join(scopeDir, "features.json");
  writeFileAtomic(path, text);
  return { path, data };
}

// -------------------------------------------------------------------------------------------
// dna init's skeleton, kept beside the module it belongs to (the same split as
// template.mjs/writingTemplate: string-building lives with the reader/measurer it seeds, file
// I/O and refusal checks live in the CLI).

export function scopeTemplate({ writer, form, audience, purpose } = {}) {
  return `---
writer: ${scalar(String(writer))}
form: ${scalar(String(form))}
audience: ${scalar(String(audience))}
purpose: ${scalar(String(purpose))}
---

# Writer DNA scope

Goldens live in goldens/. Run \`hyperspec dna measure <scope-dir>\` once every golden there has
why, approved_by and source.
`;
}

export const GOLDENS_README = `# Goldens

Each file in this folder except this one is a golden: a passage the writer marked as right,
filed under this scope.

Frontmatter:
- why (required): what makes it golden, the move it teaches.
- approved_by (required): a person slug. Golden means a human approved it; agent:* is refused.
- source (required): where the passage came from.
- approved_on (optional): a date.

The body is the passage, verbatim.

Run \`hyperspec dna measure <scope-dir>\` once every golden here has why, approved_by and source.
`;

// -------------------------------------------------------------------------------------------
// stopwords: excluded from signature_words so the list names what this writer says, not what
// every writer says. About 150 common English function words. Deliberately no contractions
// (don't, isn't, ...): a stopword is matched against a lowercased word as tokenized above, and
// keeping this list plain avoids it silently missing half its entries because a golden happened
// to use a curly apostrophe where this file used a straight one, or the other way around.
export const STOPWORDS = Object.freeze([
  "a", "about", "above", "across", "after", "again", "against", "all", "almost", "along",
  "already", "also", "although", "always", "am", "among", "an", "and", "another", "any",
  "anyone", "anything", "are", "around", "as", "at", "away", "be", "because", "been", "before",
  "being", "below", "between", "both", "but", "by", "can", "cannot", "could", "did", "do",
  "does", "doing", "done", "down", "during", "each", "either", "else", "ever", "every",
  "everyone", "everything", "few", "for", "from", "further", "had", "has", "have", "having",
  "he", "her", "here", "hers", "herself", "him", "himself", "his", "how", "however", "i", "if",
  "in", "into", "is", "it", "its", "itself", "just", "may", "me", "might", "mine", "more",
  "most", "much", "must", "my", "myself", "neither", "never", "next", "no", "nobody", "none",
  "nor", "not", "nothing", "now", "of", "off", "often", "on", "once", "one", "only", "onto",
  "or", "other", "others", "our", "ours", "ourselves", "out", "over", "own", "same", "shall",
  "she", "should", "since", "so", "some", "someone", "something", "sometimes", "still", "such",
  "than", "that", "the", "their", "theirs", "them", "themselves", "then", "there", "these",
  "they", "this", "those", "though", "through", "to", "too", "toward", "towards", "under",
  "until", "up", "upon", "us", "very", "was", "we", "were", "what", "when", "where", "whether",
  "which", "while", "who", "whom", "whose", "why", "will", "with", "within", "without", "would",
  "yet", "you", "your", "yours", "yourself", "yourselves",
]);
const STOPWORD_SET = new Set(STOPWORDS);
