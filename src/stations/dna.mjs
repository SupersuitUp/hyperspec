// Station "dna" (hyperspec 0.6). Measures the draft the way `hyperspec dna measure`
// measures a scope's goldens (dna.mjs's measureFeatures, the same function, never a second copy)
// and compares it with the scope's recorded features.json. Pure and deterministic: arithmetic on
// two features objects, no model call and no judgment about whether a difference matters beyond the
// band rule below.
//
// Runs only when writing.dna.scope_dir is set (no scope_dir: skip) and its features.json is
// current. "Current" is lint's own test-6 notion, read through the one function lint uses
// (writing-fields.mjs's featuresStaleness): a missing or stale features.json, or a scope whose
// goldens folder cannot be read, makes this station skip with the reason. Lint already fails the
// spec for each of those, and check runs no station on a spec lint fails, so the skip is defense in
// depth for a direct caller; comparing a draft against numbers that no longer describe the goldens
// would report drift from something that is not the writer's voice.
//
// Compared features, and only when the scope's features.json records them: sentence_length.mean,
// paragraph_length.mean_sentences and paragraph_length.mean_words (the two paragraph-length means),
// and every per-1000-words rate (each rates_per_1000_words entry, plus contraction_rate and the
// three person rates, which measureFeatures computes per 1000 words too). Counts, medians, p90,
// mean word length and signature words are not compared. For a scope value v the band is
// v / 1.5 (floor 0) to max(v * 1.5, v + 5), edges inside; a draft value outside it is one
// station-dna-drift finding carrying both values and the band.
//
// The em dash has one rule of its own: when the scope's em dash rate is 0 and the draft's is above
// 0, that is station-dna-em-dash, and the em dash's band finding is not also reported (it is the
// same defect, and the stricter rule already names it). Fenced and inline code are masked out of
// the draft before it is measured, like every station that reads prose.
//
// Severity: both findings are WARNINGS, never failures, so the station's status is pass
// whenever it runs. This station measures; judging whether the draft is in the writer's voice
// belongs to the lineup judge of a later release, and a band over a handful of goldens is evidence
// for that judge, not a verdict.

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { str } from "../placeholder.mjs";
import { measureFeatures, readScope } from "../dna.mjs";
import { featuresStaleness } from "../writing-fields.mjs";
import { lineAt, maskCode } from "./util.mjs";

export const name = "dna";

const MEANS = [["sentence_length", "mean"], ["paragraph_length", "mean_sentences"], ["paragraph_length", "mean_words"]];
const FLAT_RATES = ["contraction_rate", "first_person_singular_rate", "first_person_plural_rate", "second_person_rate"];
const EM_DASH = "rates_per_1000_words.em_dash";

const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const fmt = (x) => String(Math.round(x * 1000) / 1000);

// Every compared feature as [dotted name, scope value, draft value], in a fixed order, for the
// features the scope records as numbers. A draft value that is not a number reads as 0.
function comparable(scope, draft) {
  const out = [];
  const add = (key, s, d) => { if (isNum(s)) out.push([key, s, isNum(d) ? d : 0]); };
  for (const [group, field] of MEANS) add(`${group}.${field}`, scope?.[group]?.[field], draft?.[group]?.[field]);
  const rates = isObj(scope?.rates_per_1000_words) ? scope.rates_per_1000_words : {};
  for (const k of Object.keys(rates)) add(`rates_per_1000_words.${k}`, rates[k], draft?.rates_per_1000_words?.[k]);
  for (const k of FLAT_RATES) add(k, scope?.[k], draft?.[k]);
  return out;
}

// compareFeatures(scopeFeatures, draftFeatures): the band rule alone, over two measureFeatures-shaped
// objects. Returns [{ feature, scope, draft, low, high }] for every compared feature outside its band.
export function compareFeatures(scopeFeatures, draftFeatures) {
  const drift = [];
  for (const [feature, s, d] of comparable(scopeFeatures, draftFeatures)) {
    const low = Math.max(0, s / 1.5);
    const high = Math.max(s * 1.5, s + 5);
    if (d < low || d > high) drift.push({ feature, scope: s, draft: d, low, high });
  }
  return drift;
}

const skip = (reason) => ({ station: name, status: "skip", findings: [], reason });

export function run(spec, draft) {
  const scopeDir = str(spec?.data?.writing?.dna?.scope_dir);
  if (!scopeDir) return skip("writing.dna.scope_dir is not set");

  const scopeAbs = resolve(spec?.dir || ".", scopeDir);
  const measure = `run \`hyperspec dna measure ${scopeDir}\``;
  const disk = readScope(scopeAbs, { displayDir: scopeDir });
  if (disk.findings.some((x) => x.id === "writing-dna-goldens-missing" || x.id === "writing-dna-goldens-outside")) {
    return skip(`writing.dna.scope_dir "${scopeDir}": its goldens cannot be read (run \`hyperspec lint\` for details)`);
  }
  const featuresPath = join(scopeAbs, "features.json");
  const stale = featuresStaleness(featuresPath, disk.scope, disk.goldens);
  if (stale === "missing") return skip(`writing.dna.scope_dir "${scopeDir}" has no features.json (or it is not valid JSON); ${measure}`);
  if (stale) return skip(`writing.dna.scope_dir "${scopeDir}"'s features.json is stale: ${stale}; ${measure}`);

  let scopeFeatures;
  try { scopeFeatures = JSON.parse(readFileSync(featuresPath, "utf8")).features; } catch { scopeFeatures = null; }
  if (!isObj(scopeFeatures)) return skip(`writing.dna.scope_dir "${scopeDir}" has no features.json (or it is not valid JSON); ${measure}`);

  const masked = maskCode(draft.text);
  const draftFeatures = measureFeatures([masked]);
  const findings = [];

  const scopeEm = scopeFeatures.rates_per_1000_words?.em_dash;
  const draftEm = draftFeatures.rates_per_1000_words.em_dash;
  const emDashRule = scopeEm === 0 && draftEm > 0;
  if (emDashRule) {
    findings.push({
      station: name,
      id: "station-dna-em-dash",
      severity: "warn",
      line: lineAt(draft.text, masked.indexOf("\u2014")),
      message: `the draft uses em dashes (${fmt(draftEm)} per 1000 words); the scope's goldens use none (0)`,
      fix: "Rewrite each em dash as the punctuation the goldens use instead: a comma, a colon, parentheses or a new sentence.",
    });
  }

  for (const d of compareFeatures(scopeFeatures, draftFeatures)) {
    if (emDashRule && d.feature === EM_DASH) continue;
    findings.push({
      station: name,
      id: "station-dna-drift",
      severity: "warn",
      message: `${d.feature} is ${fmt(d.draft)} in the draft; the scope's goldens measure ${fmt(d.scope)}, band ${fmt(d.low)} to ${fmt(d.high)}`,
      fix: `Bring ${d.feature} back inside the band, or, if the scope no longer describes this writer, re-measure it with better goldens.`,
    });
  }

  // Every finding here is a warning, so the station passes whenever it runs.
  return { station: name, status: findings.some((x) => x.severity === "fail") ? "fail" : "pass", findings };
}
