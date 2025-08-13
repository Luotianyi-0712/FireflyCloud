import { drizzle } from "drizzle-orm/bun-sqlite"
import { Database } from "bun:sqlite"
import * as schema from "./schema"

const sqlite = new Database(process.env.DATABASE_PATH || "./netdisk.db")
export const db = drizzle(sqlite, { schema })

// Initialize database
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    size INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    storage_type TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS storage_config (
    id INTEGER PRIMARY KEY DEFAULT 1,
    storage_type TEXT NOT NULL DEFAULT 'local',
    r2_endpoint TEXT,
    r2_access_key TEXT,
    r2_secret_key TEXT,
    r2_bucket TEXT,
    updated_at INTEGER NOT NULL
  );

  INSERT OR IGNORE INTO storage_config (storage_type, updated_at) 
  VALUES ('local', ${Date.now()});

  INSERT OR IGNORE INTO users (id, email, password, role, created_at, updated_at)
  VALUES ('admin', 'admin@cialloo.site', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin', ${Date.now()}, ${Date.now()});
`)
