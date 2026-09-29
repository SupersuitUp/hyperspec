// The three stages of the example factory. Each is a plain text transform with no model in it,
// so the same inputs always give the same bytes. factory.mjs runs them the first time;
// runner.mjs runs them again when `hyperspec regenerate --run` asks for a stage.

// claims: every line spoken on a call, without the speaker's name, as a bullet.
export function claims(calls) {
  const lines = calls.flatMap((text) => text.split("\n"))
    .map((line) => line.replace(/^[^:]+:\s*/, "").trim())
    .filter(Boolean);
  return lines.map((line) => `- ${line}`).join("\n") + "\n";
}

// terms: every "term: definition" line in the notes, sorted by term.
export function terms(notes) {
  const lines = notes.flatMap((text) => text.split("\n")).filter((line) => line.includes(":"));
  return lines
    .map((line) => { const i = line.indexOf(":"); return [line.slice(0, i).trim(), line.slice(i + 1).trim()]; })
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([term, meaning]) => `- **${term}**: ${meaning}`)
    .join("\n") + "\n";
}

// draft: the essay, built from the two earlier stages.
export function draft(claimsText, termsText) {
  return `# What a recipe is for\n\n## Claims\n\n${claimsText}\n## Terms\n\n${termsText}`;
}

// The verdict each stage reports: a stage that produced nothing fails.
export function verdict(stage, output) {
  return { station: `${stage}-not-empty`, pass: output.trim().length > 0, note: "" };
}
