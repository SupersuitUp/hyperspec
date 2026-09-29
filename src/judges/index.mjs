// The judge registry: every judgment station `hyperspec judge` knows about, in run order. Each
// entry carries name, instructions (fixed text for the packet), skipReason(spec, draft) (null when
// the station applies; the draft is there for a station that needs something in it, like lineup),
// packet(spec, draft) returning { rubric, inputs, verdict_schema, key }, validate(verdict,
// packet, t, key) and derive(verdict, packet, t, key) (derive returns { status, findings } and may
// add summary, a one-line result such as attribution's accuracy); a station whose inputs come from
// files other than the spec and the draft also carries inputSources(spec), naming them, or null
// when this spec has none (lineup: the goldens; persona: the claims ledger), so record can call a
// packet whose inputs went out of date stale rather than edited; such a station also carries
// sourceSkip(spec, draft), the skip reason when it skips because of those files (else null), so a
// packet whose station stopped applying for that reason is stale too, and any other skip is not. The packet and key a station receives are
// always the ones record rebuilt from the spec and draft on disk, never read from a file; see
// src/judge.mjs for the framework that calls them. Adding a judge is one file plus one line here.

import * as doctor from "./doctor.mjs";
import * as lineup from "./lineup.mjs";
import * as reader from "./reader.mjs";
import * as persona from "./persona.mjs";
import * as attribution from "./attribution.mjs";
import * as knowledge from "./knowledge.mjs";

export const JUDGES = Object.freeze([
  { name: doctor.name, instructions: doctor.DOCTOR_INSTRUCTIONS, skipReason: doctor.skipReason, packet: doctor.packet, validate: doctor.validate, derive: doctor.derive },
  { name: lineup.name, instructions: lineup.LINEUP_INSTRUCTIONS, skipReason: lineup.skipReason, packet: lineup.packet, validate: lineup.validate, derive: lineup.derive, inputSources: lineup.inputSources, sourceSkip: lineup.sourceSkip },
  { name: reader.name, instructions: reader.READER_INSTRUCTIONS, skipReason: reader.skipReason, packet: reader.packet, validate: reader.validate, derive: reader.derive },
  { name: persona.name, instructions: persona.PERSONA_INSTRUCTIONS, skipReason: persona.skipReason, packet: persona.packet, validate: persona.validate, derive: persona.derive, inputSources: persona.inputSources, sourceSkip: persona.sourceSkip },
  { name: attribution.name, instructions: attribution.ATTRIBUTION_INSTRUCTIONS, skipReason: attribution.skipReason, packet: attribution.packet, validate: attribution.validate, derive: attribution.derive },
  { name: knowledge.name, instructions: knowledge.KNOWLEDGE_INSTRUCTIONS, skipReason: knowledge.skipReason, packet: knowledge.packet, validate: knowledge.validate, derive: knowledge.derive },
]);

export const JUDGE_NAMES = Object.freeze(JUDGES.map((j) => j.name));
