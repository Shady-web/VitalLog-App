// VitalLog mobile — Phase 1 bring-up.
//
// Proves the QVAC SDK runs on-device under Expo (react-native-bare-kit worklet):
// load the LLM, stream one guardrailed explanation, unload. Once this runs on a
// real device in airplane mode, the full four-screen UI gets ported on top.
//
// All inference is local via @qvac/sdk — the same API as the desktop build; the
// SDK resolves the Expo worklet RPC client automatically.
import { useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from "react-native";
import {
  loadModel,
  completion,
  unloadModel,
  LLAMA_3_2_1B_INST_Q4_0,
} from "@qvac/sdk";

const DISCLAIMER = "This is general information, not medical advice.";

const GUARDRAIL_SYSTEM_PROMPT = `You are a health information assistant. You explain medical text in plain,
simple language a non-expert can understand. You DO NOT diagnose, DO NOT
recommend treatments or medications, and DO NOT give dosage advice. When
asked for any of those, you say you can't and suggest the user ask a
licensed professional. You only explain terms and what a document says.
Always end with: "This is general information, not medical advice."`;

const SAMPLE_LAB = `Hemoglobin: 11.2 g/dL (reference 13.5-17.5)  LOW
Fasting Glucose: 101 mg/dL (reference 70-99)  HIGH
LDL Cholesterol: 128 mg/dL (reference <100)  HIGH`;

// Strip markdown markers so the explanation reads as clean prose.
const cleanText = (s: string) =>
  s.replace(/\*\*/g, "").replace(/\*/g, "").replace(/`/g, "").replace(/^\s{0,3}#{1,6}\s+/gm, "");

export default function App() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [output, setOutput] = useState("");

  async function explain() {
    setBusy(true);
    setOutput("");
    setStatus("Loading model…");
    let modelId: string | undefined;
    try {
      modelId = await loadModel({
        modelSrc: LLAMA_3_2_1B_INST_Q4_0,
        modelType: "llm",
        modelConfig: { ctx_size: 4096 },
        onProgress: (p: any) => {
          const pct = p && typeof p.percentage === "number" ? Math.round(p.percentage) : null;
          setStatus(pct == null ? "Loading model…" : `Downloading model… ${pct}%`);
        },
      });

      setStatus("Generating explanation…");
      const history = [
        {
          role: "system",
          content:
            GUARDRAIL_SYSTEM_PROMPT +
            "\n\nWrite in plain, refined prose. Do NOT use markdown, asterisks, or headings.",
        },
        { role: "user", content: `Explain the following in plain language:\n\n${SAMPLE_LAB}` },
      ];

      const run = completion({ modelId, history, stream: true, generationParams: { predict: 512 } });
      let buf = "";
      for await (const event of run.events) {
        if (event.type === "contentDelta") {
          buf += event.text;
          setOutput(cleanText(buf));
        }
      }
      if (!buf.trim().endsWith(DISCLAIMER)) setOutput((o) => `${o}\n\n${DISCLAIMER}`);
      setStatus("");
    } catch (err: any) {
      setStatus("");
      setOutput(`Error: ${err?.message ?? String(err)}`);
    } finally {
      if (modelId) {
        try { await unloadModel({ modelId }); } catch {}
      }
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.brandRow}>
          <View style={styles.mark}>
            <Text style={styles.markText}>+</Text>
          </View>
          <View>
            <Text style={styles.brand}>
              VitalLog<Text style={styles.dot}> ●</Text>
            </Text>
            <Text style={styles.tagline}>On-device health explainer</Text>
          </View>
        </View>

        <Text style={styles.h2}>Bring-up test</Text>
        <Text style={styles.body}>
          Tap to load the language model on this device and explain a sample lab result. Everything
          runs locally — works in airplane mode once the model is cached.
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>Sample lab result</Text>
          <Text style={styles.mono}>{SAMPLE_LAB}</Text>
        </View>

        <TouchableOpacity
          style={[styles.btn, busy && styles.btnDisabled]}
          onPress={explain}
          disabled={busy}
          activeOpacity={0.85}
        >
          <Text style={styles.btnText}>{busy ? "Working…" : "Explain on-device"}</Text>
        </TouchableOpacity>

        {!!status && (
          <View style={styles.status}>
            <ActivityIndicator color="#1c3a13" />
            <Text style={styles.statusText}>{status}</Text>
          </View>
        )}

        {!!output && (
          <View style={styles.card}>
            <Text style={styles.label}>Explanation</Text>
            <Text style={styles.body}>{output}</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.safety}>
        <Text style={styles.safetyText}>Not medical advice — consult a licensed professional.</Text>
      </View>
    </SafeAreaView>
  );
}

// Seed design tokens: forest green on warm parchment, a single lime accent, pills, flat.
const FOREST = "#1c3a13";
const PARCHMENT = "#fcfcf7";
const STONE = "#eeeee9";
const LIME = "#d3fa99";

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PARCHMENT },
  content: { padding: 20, paddingBottom: 40 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8, marginBottom: 24 },
  mark: { width: 44, height: 44, borderRadius: 14, backgroundColor: FOREST, alignItems: "center", justifyContent: "center" },
  markText: { color: PARCHMENT, fontSize: 24, fontWeight: "300" },
  brand: { fontSize: 20, color: FOREST, fontWeight: "500" },
  dot: { color: LIME },
  tagline: { fontSize: 13, color: "rgba(28,58,19,0.66)" },
  h2: { fontSize: 28, color: FOREST, fontWeight: "300", letterSpacing: -0.8, marginBottom: 8 },
  body: { fontSize: 16, color: FOREST, lineHeight: 23 },
  card: { backgroundColor: PARCHMENT, borderWidth: 1, borderColor: "rgba(28,58,19,0.16)", borderRadius: 16, padding: 16, marginVertical: 16 },
  label: { fontSize: 12, color: "rgba(28,58,19,0.46)", letterSpacing: 1, textTransform: "uppercase", fontWeight: "500", marginBottom: 8 },
  mono: { fontFamily: "monospace", fontSize: 13, color: "rgba(28,58,19,0.8)", lineHeight: 20 },
  btn: { backgroundColor: FOREST, borderRadius: 9999, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  btnDisabled: { backgroundColor: "#b3b3b3" },
  btnText: { color: PARCHMENT, fontSize: 16, fontWeight: "500" },
  status: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
  statusText: { color: "rgba(28,58,19,0.66)", fontSize: 14 },
  safety: { backgroundColor: LIME, paddingVertical: 12, paddingHorizontal: 20 },
  safetyText: { color: FOREST, fontSize: 14, fontWeight: "500", textAlign: "center" },
});
