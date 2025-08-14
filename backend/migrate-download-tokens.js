import Database from "bun:sqlite"
import { readFileSync } from "fs"
import { join } from "path"

const dbPath = join(process.cwd(), "netdisk.db")
const db = new Database(dbPath)

try {
  console.log("开始执行下载令牌表迁移...")
  
  // 读取SQL文件
  const sqlContent = readFileSync(join(process.cwd(), "migrate-download-tokens.sql"), "utf-8")
  
  // 手动执行SQL语句
  console.log("创建 download_tokens 表...")
  db.run(`
    CREATE TABLE IF NOT EXISTS download_tokens (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      used INTEGER NOT NULL DEFAULT 0,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )
  `)

  console.log("创建索引...")
  db.run("CREATE INDEX IF NOT EXISTS idx_download_tokens_token ON download_tokens(token)")
  db.run("CREATE INDEX IF NOT EXISTS idx_download_tokens_file_id ON download_tokens(file_id)")
  db.run("CREATE INDEX IF NOT EXISTS idx_download_tokens_user_id ON download_tokens(user_id)")
  db.run("CREATE INDEX IF NOT EXISTS idx_download_tokens_expires_at ON download_tokens(expires_at)")
  
  console.log("下载令牌表迁移完成！")
  
  // 验证表是否创建成功
  const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='download_tokens'").all()
  if (tables.length > 0) {
    console.log("✅ download_tokens 表创建成功")
  } else {
    console.log("❌ download_tokens 表创建失败")
  }
  
} catch (error) {
  console.error("迁移失败:", error)
  process.exit(1)
} finally {
  db.close()
}
