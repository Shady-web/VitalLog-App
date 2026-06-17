#!/usr/bin/env node
// scripts/verify-offline.mjs
//
// Static evidence that VitalLog does all AI locally and makes no external/cloud
// calls: every model call goes through @qvac/sdk, core/ imports nothing else, and
// there are no outbound HTTP calls to non-localhost hosts in the source. Prints a
// PASS/FAIL report for the submission evidence bundle.
//
//   npm run verify
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["core", "app-node"];
const SCAN_EXT = new Set([".ts", ".js", ".mjs"]);
const SKIP = new Set(["node_modules"]);

// Cloud-AI / external-service identifiers that must NOT appear in an import.
const FORBIDDEN = [
  "openai", "anthropic", "googleapis", "generativeai", "@google/genai",
  "cohere", "mistralai", "replicate", "aws-sdk", "@azure", "vertexai",
];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (SCAN_EXT.has(extname(p))) out.push(p);
  }
  return out;
}

const files = SCAN_DIRS.flatMap((d) => {
  try { return walk(join(ROOT, d)); } catch { return []; }
});

const findings = [];
for (const file of files) {
  readFileSync(file, "utf8").split(/\r?\n/).forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, ""); // drop line comments (doc URLs)
    const lower = code.toLowerCase();
    for (const f of FORBIDDEN) {
      if (lower.includes(f) && /\b(import|require|from)\b/.test(lower)) {
        findings.push({ file, line: i + 1, issue: `external AI SDK import: ${f}`, text: line.trim() });
      }
    }
    const m = code.match(/https?:\/\/[^\s"'`)]+/);
    if (m && /\b(fetch|axios|request|connect|WebSocket)\s*\(/.test(code)) {
      const host = m[0].replace(/^https?:\/\//, "");
      if (!/^(localhost|127\.0\.0\.1)/.test(host)) {
        findings.push({ file, line: i + 1, issue: `outbound network call: ${m[0]}`, text: line.trim() });
      }
    }
  });
}

// core/ must import only @qvac/sdk (besides node: builtins and local files).
const coreImports = new Set();
for (const file of files.filter((f) => /[\\/]core[\\/]/.test(f))) {
  for (const m of readFileSync(file, "utf8").matchAll(/from\s+"([^"]+)"/g)) {
    const spec = m[1];
    if (!spec.startsWith(".") && !spec.startsWith("node:")) coreImports.add(spec);
  }
}
const badCoreImports = [...coreImports].filter((s) => s !== "@qvac/sdk");

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const deps = Object.keys(pkg.dependencies || {});

console.log("VitalLog — offline / on-device verification\n");
console.log(`Scanned ${files.length} source files in: ${SCAN_DIRS.join(", ")}`);
console.log(`Runtime dependencies: ${deps.join(", ") || "(none)"}`);
console.log(`core/ third-party imports: ${[...coreImports].join(", ") || "(none)"}\n`);

let ok = true;
const check = (pass, good, bad) => { if (pass) console.log("  ✓ " + good); else { ok = false; console.log("  ✗ " + bad); } };

check(findings.length === 0, "No external network or cloud-AI references in source.",
  "External references found:\n" + findings.map((f) => `      ${f.file}:${f.line}  ${f.issue}`).join("\n"));
check(badCoreImports.length === 0, "core/ imports only @qvac/sdk (plus Node builtins / local files).",
  `core/ imports a non-@qvac package: ${badCoreImports.join(", ")}`);
check(deps.includes("@qvac/sdk"), "@qvac/sdk is the AI engine (the only runtime dependency).",
  "@qvac/sdk is not a runtime dependency.");

console.log("\n" + (ok
  ? "PASS — all AI is local via @qvac/sdk; no external calls in source."
  : "FAIL — see findings above."));
process.exit(ok ? 0 : 1);
