import Database from "better-sqlite3";
import { join } from "node:path";

const DB_PATH = process.env.DB_PATH || join(process.cwd(), "zoomscriber.db");
const db = new Database(DB_PATH);

// Initialize schema for storing account configuration
db.exec(`
  CREATE TABLE IF NOT EXISTS account_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL UNIQUE,
    robot_jid TEXT,
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
  );
`);

export type AccountConfig = {
  account_id: string;
  robot_jid?: string;
  updated_at: number;
};

/**
 * Save account configuration (account_id and robot_jid) from bot_installed webhook
 */
export function saveAccountConfig(accountId: string, robotJid?: string): void {
  const updatedAt = Math.floor(Date.now() / 1000);
  const stmt = db.prepare(
    "INSERT OR REPLACE INTO account_config (account_id, robot_jid, updated_at) VALUES (?, ?, ?)"
  );
  stmt.run(accountId, robotJid || null, updatedAt);
  console.log("Saved account config:", { account_id: accountId, robot_jid: robotJid });
}

/**
 * Get account configuration
 */
export function getAccountConfig(): AccountConfig | null {
  const stmt = db.prepare("SELECT * FROM account_config ORDER BY updated_at DESC LIMIT 1");
  const row = stmt.get() as AccountConfig | undefined;
  return row || null;
}

/**
 * Get account_id from database
 */
export function getAccountId(): string | null {
  const config = getAccountConfig();
  return config?.account_id || null;
}

/**
 * Get robot_jid from database
 */
export function getRobotJid(): string | null {
  const config = getAccountConfig();
  return config?.robot_jid || null;
}

