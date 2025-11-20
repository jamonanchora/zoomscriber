import Database from "better-sqlite3";
import { join } from "node:path";

const DB_PATH = process.env.DB_PATH || join(process.cwd(), "zoomscriber.db");
const db = new Database(DB_PATH);

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS oauth_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL UNIQUE,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
  );
`);

export type TokenRecord = {
  account_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: number;
};

export function getToken(accountId: string): TokenRecord | null {
  const stmt = db.prepare("SELECT * FROM oauth_tokens WHERE account_id = ?");
  const row = stmt.get(accountId) as TokenRecord | undefined;
  return row || null;
}

export function saveToken(accountId: string, accessToken: string, refreshToken: string, expiresIn: number): void {
  const expiresAt = Date.now() + expiresIn * 1000;
  const stmt = db.prepare(
    "INSERT OR REPLACE INTO oauth_tokens (account_id, access_token, refresh_token, expires_at) VALUES (?, ?, ?, ?)"
  );
  stmt.run(accountId, accessToken, refreshToken, expiresAt);
}

export function updateAccessToken(accountId: string, accessToken: string, expiresIn: number): void {
  const expiresAt = Date.now() + expiresIn * 1000;
  const stmt = db.prepare("UPDATE oauth_tokens SET access_token = ?, expires_at = ? WHERE account_id = ?");
  stmt.run(accessToken, expiresAt, accountId);
}

