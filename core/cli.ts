// core/cli.ts — VitalLog dev CLI. Subcommand dispatcher over the core/ modules.
//
// Usage (via npm scripts):
//   npm run explain -- "Hemoglobin A1c: 6.1% ..."   # explain a text block
//   echo "..." | npm run explain                     # or pipe text on stdin
//   npm run explain                                  # no input -> built-in sample
//   npm run ocr -- ./data/samples/sample-lab.png     # photo -> extracted text -> explanation
import { explain } from "./explain.ts";
import { extractText } from "./ocr.ts";

const SAMPLE_LAB_RESULT = `COMPLETE BLOOD COUNT (CBC)
Hemoglobin: 11.2 g/dL (reference 13.5-17.5)  LOW
White Blood Cells: 11.8 x10^9/L (reference 4.0-11.0)  HIGH
Platelets: 240 x10^9/L (reference 150-400)
LDL Cholesterol: 162 mg/dL (reference <100)  HIGH`;

const SAMPLE_IMAGE = "data/samples/sample-lab.png";

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function downloadProgress(p: unknown) {
  process.stderr.write(`\rdownloading: ${JSON.stringify(p)}`);
}

// `npm run explain -- "text"` -> explain a block of text (arg or stdin or sample).
async function cmdExplain(args: string[]) {
  const argText = args.join(" ").trim();
  const stdinText = argText ? "" : (await readStdin()).trim();
  const input = argText || stdinText || SAMPLE_LAB_RESULT;

  if (!argText && !stdinText) {
    console.error("No input provided — using the built-in sample lab result.\n");
  }
  console.error("Loading model and generating explanation (first run downloads ~773 MB)...\n");

  await explain(input, {
    onToken: (token) => process.stdout.write(token),
    onProgress: downloadProgress,
  });
  process.stdout.write("\n");
}

// `npm run ocr -- ./image.png` -> OCR the image, then pipe the text into explain().
async function cmdOcr(args: string[]) {
  const imagePath = (args[0] || "").trim() || SAMPLE_IMAGE;
  if (!args[0]) {
    console.error(`No image path provided — using the built-in sample: ${SAMPLE_IMAGE}\n`);
  }

  console.error(`Running OCR on: ${imagePath}\n(first run downloads ~98 MB of OCR models)\n`);
  const text = await extractText(imagePath, { onProgress: downloadProgress });

  console.error("\n--- Extracted text ---");
  console.log(text);
  console.error("--- End extracted text ---\n");

  if (!text) {
    console.error("OCR returned no text; skipping explanation.");
    return;
  }

  console.error("Explaining the extracted text...\n");
  await explain(text, {
    onToken: (token) => process.stdout.write(token),
    onProgress: downloadProgress,
  });
  process.stdout.write("\n");
}

async function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  switch (command) {
    case "explain":
      return cmdExplain(args);
    case "ocr":
      return cmdOcr(args);
    default:
      console.error(
        `Unknown command: ${command ?? "(none)"}\n` +
          `Usage:\n` +
          `  npm run explain -- "<text>"\n` +
          `  npm run ocr -- <image-path>`,
      );
      process.exit(1);
  }
}

main().catch((error) => {
  console.error("\n❌ Error:", error);
  process.exit(1);
});
