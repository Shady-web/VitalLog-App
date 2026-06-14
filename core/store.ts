// core/store.ts — tiny JSON-on-disk journal store (no dependencies, fully offline).
//
// Health data never leaves the device and is never committed: entries live under
// data/journal/ which is gitignored. Used by transcribe.ts (write) and summary.ts (read).
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

export type JournalEntryType = "voice" | "note" | "lab";

export interface JournalEntry {
  id: string;
  type: JournalEntryType;
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** The entry text (e.g. a voice-note transcript). */
  text: string;
  /** Optional provenance, e.g. the source audio/image file path. */
  source?: string;
}

const JOURNAL_PATH = resolve("data/journal/entries.json");

function readAll(path: string): JournalEntry[] {
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf8").trim();
  if (!raw) return [];
  return JSON.parse(raw) as JournalEntry[];
}

function writeAll(path: string, entries: JournalEntry[]): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(entries, null, 2) + "\n", "utf8");
}

/** Append a journal entry; id and timestamp are assigned here. Returns the stored entry. */
export function addEntry(
  entry: Omit<JournalEntry, "id" | "timestamp"> & { timestamp?: string },
  path: string = JOURNAL_PATH,
): JournalEntry {
  const stored: JournalEntry = {
    id: randomUUID(),
    timestamp: entry.timestamp ?? new Date().toISOString(),
    type: entry.type,
    text: entry.text,
    ...(entry.source ? { source: entry.source } : {}),
  };
  const entries = readAll(path);
  entries.push(stored);
  writeAll(path, entries);
  return stored;
}

/** Read all journal entries, oldest first. */
export function getEntries(path: string = JOURNAL_PATH): JournalEntry[] {
  return readAll(path);
}

export { JOURNAL_PATH };
