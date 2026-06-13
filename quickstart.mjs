// QVAC SDK sanity check — verified against @qvac/sdk@0.12.2 (its own README quickstart).
// Loads Llama 3.2 1B Instruct (Q4_0), runs one streamed completion, unloads.
// The model (~773 MB) downloads once on first run, then runs fully offline.
import { loadModel, LLAMA_3_2_1B_INST_Q4_0, completion, unloadModel } from "@qvac/sdk";

try {
  // Load a model into memory.
  const modelId = await loadModel({
    modelSrc: LLAMA_3_2_1B_INST_Q4_0,
    modelType: "llm",
    onProgress: (progress) => {
      console.log(progress);
    },
  });

  // Run one completion and stream the tokens as they arrive.
  const history = [
    { role: "user", content: "Explain quantum computing in one sentence." },
  ];
  const result = completion({ modelId, history, stream: true });
  for await (const token of result.tokenStream) {
    process.stdout.write(token);
  }
  process.stdout.write("\n");

  // Unload the model to free system resources.
  await unloadModel({ modelId });
} catch (error) {
  console.error("❌ Error:", error);
  process.exit(1);
}
