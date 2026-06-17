// app-node/auth.ts — local, offline account + session handling for the VitalLog UI.
//
// Accounts are stored on disk with salted scrypt password hashes (Node's built-in
// crypto — no dependency, no external auth service). Sessions are kept in memory and
// referenced by an httpOnly cookie. This is local demo-grade auth for a single-machine
// app, not a production identity system.
import { scryptSync, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ACCOUNTS_PATH = resolve("data/store/accounts.json");

export interface Account {
  id: string;
  username: string;
  salt: string;
  hash: string;
  createdAt: string;
}

function readAccounts(): Account[] {
  if (!existsSync(ACCOUNTS_PATH)) return [];
  const raw = readFileSync(ACCOUNTS_PATH, "utf8").trim();
  return raw ? (JSON.parse(raw) as Account[]) : [];
}

function writeAccounts(accounts: Account[]): void {
  mkdirSync(dirname(ACCOUNTS_PATH), { recursive: true });
  writeFileSync(ACCOUNTS_PATH, JSON.stringify(accounts, null, 2) + "\n", "utf8");
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export interface AuthResult {
  ok: boolean;
  error?: string;
  account?: Account;
}

export function register(username: string, password: string): AuthResult {
  const name = username.trim();
  if (name.length < 2) return { ok: false, error: "Username must be at least 2 characters." };
  if (password.length < 6) return { ok: false, error: "Password must be at least 6 characters." };

  const accounts = readAccounts();
  if (accounts.some((a) => a.username.toLowerCase() === name.toLowerCase())) {
    return { ok: false, error: "That username is already taken." };
  }
  const salt = randomBytes(16).toString("hex");
  const account: Account = {
    id: randomUUID(),
    username: name,
    salt,
    hash: hashPassword(password, salt),
    createdAt: new Date().toISOString(),
  };
  accounts.push(account);
  writeAccounts(accounts);
  return { ok: true, account };
}

export function login(username: string, password: string): AuthResult {
  const name = username.trim();
  const account = readAccounts().find((a) => a.username.toLowerCase() === name.toLowerCase());
  // Always run a hash to keep timing similar whether or not the user exists.
  const candidate = hashPassword(password, account?.salt ?? "00");
  if (!account || !safeEqualHex(candidate, account.hash)) {
    return { ok: false, error: "Incorrect username or password." };
  }
  return { ok: true, account };
}

// ---- sessions (persisted to disk so a server restart keeps users signed in) ----
interface Session { userId: string; username: string; }
const SESSIONS_PATH = resolve("data/store/sessions.json");
export const SESSION_COOKIE = "vl_session";

function loadSessions(): Map<string, Session> {
  if (!existsSync(SESSIONS_PATH)) return new Map();
  try {
    const obj = JSON.parse(readFileSync(SESSIONS_PATH, "utf8")) as Record<string, Session>;
    return new Map(Object.entries(obj));
  } catch {
    return new Map();
  }
}

const sessions = loadSessions();

function saveSessions(): void {
  mkdirSync(dirname(SESSIONS_PATH), { recursive: true });
  writeFileSync(SESSIONS_PATH, JSON.stringify(Object.fromEntries(sessions)), "utf8");
}

export function createSession(account: Account): string {
  const token = randomBytes(24).toString("hex");
  sessions.set(token, { userId: account.id, username: account.username });
  saveSessions();
  return token;
}

export function getSession(token: string | undefined): Session | null {
  if (!token) return null;
  return sessions.get(token) ?? null;
}

export function destroySession(token: string | undefined): void {
  if (token && sessions.delete(token)) saveSessions();
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx > -1) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}
