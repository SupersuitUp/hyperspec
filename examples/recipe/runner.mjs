// The runner `hyperspec regenerate --run "node runner.mjs"` calls once per stage it must rerun.
// stdin: { stage, reads: [{ ref, sha256, path }], model }. Each read is a temp file holding the
// exact bytes that ref resolved to. stdout: the stage's output, byte for byte. The last stderr
// line starting "VERDICT " is the stage's verdict.
import { readFileSync } from "node:fs";
import { claims, draft, terms, verdict } from "./stages.mjs";

const job = JSON.parse(readFileSync(0, "utf8"));
const text = (ref) => readFileSync(job.reads.find((r) => r.ref === ref).path, "utf8");
const inputs = () => job.reads.filter((r) => r.ref.startsWith("input:")).map((r) => readFileSync(r.path, "utf8"));

let output;
if (job.stage === "claims") output = claims(inputs());
else if (job.stage === "terms") output = terms(inputs());
else if (job.stage === "draft") output = draft(text("stage:claims"), text("stage:terms"));
else { console.error(`runner.mjs does not know stage ${job.stage}`); process.exit(2); }

process.stdout.write(output);
console.error(`VERDICT ${JSON.stringify(verdict(job.stage, output))}`);
