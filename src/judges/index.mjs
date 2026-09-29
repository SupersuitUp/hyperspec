// The judge registry: every judgment station `hyperspec judge` knows about, in run order. Each
// entry carries name, instructions (fixed text for the packet), skipReason(spec, draft) (null when
// the station applies; the draft is there for a station that needs something in it, like lineup),
// packet(spec, draft) returning { rubric, inputs, verdict_schema, key }, validate(verdict,
// packet, t, key) and derive(verdict, packet, t, key). The packet and key a station receives are
// always the ones record rebuilt from the spec and draft on disk, never read from a file; see
// src/judge.mjs for the framework that calls them. Adding a judge is one file plus one line here.

import * as doctor from "./doctor.mjs";
import * as lineup from "./lineup.mjs";
import * as reader from "./reader.mjs";

export const JUDGES = Object.freeze([
  { name: doctor.name, instructions: doctor.DOCTOR_INSTRUCTIONS, skipReason: doctor.skipReason, packet: doctor.packet, validate: doctor.validate, derive: doctor.derive },
  { name: lineup.name, instructions: lineup.LINEUP_INSTRUCTIONS, skipReason: lineup.skipReason, packet: lineup.packet, validate: lineup.validate, derive: lineup.derive },
  { name: reader.name, instructions: reader.READER_INSTRUCTIONS, skipReason: reader.skipReason, packet: reader.packet, validate: reader.validate, derive: reader.derive },
]);

export const JUDGE_NAMES = Object.freeze(JUDGES.map((j) => j.name));
