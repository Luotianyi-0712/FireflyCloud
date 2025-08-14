import Database from "bun:sqlite"
import { join } from "path"

const dbPath = join(process.cwd(), "netdisk.db")
const db = new Database(dbPath)

try {
  console.log("开始执行文件直链表迁移...")
  
  console.log("创建 file_direct_links 表...")
  db.run(`
    CREATE TABLE IF NOT EXISTS file_direct_links (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      enabled INTEGER NOT NULL DEFAULT 1,
      access_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)
  
  console.log("创建索引...")
  db.run("CREATE INDEX IF NOT EXISTS idx_file_direct_links_token ON file_direct_links(token)")
  db.run("CREATE INDEX IF NOT EXISTS idx_file_direct_links_file_id ON file_direct_links(file_id)")
  db.run("CREATE INDEX IF NOT EXISTS idx_file_direct_links_user_id ON file_direct_links(user_id)")
  
  console.log("文件直链表迁移完成！")
  
  // 验证表是否创建成功
  const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='file_direct_links'").all()
  if (tables.length > 0) {
    console.log("✅ file_direct_links 表创建成功")
  } else {
    console.log("❌ file_direct_links 表创建失败")
  }
  
} catch (error) {
  console.error("迁移失败:", error)
  process.exit(1)
} finally {
  db.close()
}
