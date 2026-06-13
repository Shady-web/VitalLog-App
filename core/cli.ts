// core/cli.ts — tiny CLI around explain() so you can run it against a lab-result string.
//
// Usage:
//   npm run explain -- "Hemoglobin A1c: 6.1% ..."     # pass text as an argument
//   echo "Hemoglobin A1c: 6.1% ..." | npm run explain  # or pipe text on stdin
//   npm run explain                                    # no input -> runs a built-in sample
import { explain } from "./explain.ts";

const SAMPLE_LAB_RESULT = `COMPLETE BLOOD COUNT (CBC)
Hemoglobin: 11.2 g/dL (reference 13.5-17.5)  LOW
White Blood Cells: 11.8 x10^9/L (reference 4.0-11.0)  HIGH
Platelets: 240 x10^9/L (reference 150-400)
LDL Cholesterol: 162 mg/dL (reference <100)  HIGH`;

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const argText = process.argv.slice(2).join(" ").trim();
  const stdinText = argText ? "" : (await readStdin()).trim();
  const input = argText || stdinText || SAMPLE_LAB_RESULT;

  if (!argText && !stdinText) {
    console.error("No input provided — using the built-in sample lab result.\n");
  }

  console.error("Loading model and generating explanation (first run downloads ~773 MB)...\n");

  await explain(input, {
    onToken: (token) => process.stdout.write(token),
    onProgress: (p) => process.stderr.write(`\rdownloading: ${JSON.stringify(p)}`),
  });

  process.stdout.write("\n");
}

main().catch((error) => {
  console.error("\n❌ Error:", error);
  process.exit(1);
});
