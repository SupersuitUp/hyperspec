// The doctor `hyperspec compare --doctor "node doctor.mjs"` runs once on the parent's output and
// once on the child's, with the same spec. stdin: { output, spec }, both absolute paths. The last
// stdout line is { "score": <number>, "notes": "..." }. This one scores an essay by how many
// claims it carries.
import { readFileSync } from "node:fs";

const { output } = JSON.parse(readFileSync(0, "utf8"));
const essay = readFileSync(output, "utf8");
const section = essay.split("## Claims")[1]?.split("## ")[0] ?? "";
const score = section.split("\n").filter((line) => line.startsWith("- ")).length;
console.log(JSON.stringify({ score, notes: `${score} claims` }));
