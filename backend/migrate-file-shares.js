import Database from "bun:sqlite"
import { join } from "path"

const dbPath = join(process.cwd(), "netdisk.db")
const db = new Database(dbPath)

try {
  console.log("开始执行文件分享表迁移...")
  
  console.log("创建 file_shares 表...")
  db.run(`
    CREATE TABLE IF NOT EXISTS file_shares (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      share_token TEXT NOT NULL UNIQUE,
      pickup_code TEXT,
      require_login INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      access_count INTEGER NOT NULL DEFAULT 0,
      expires_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)
  
  console.log("创建索引...")
  db.run("CREATE INDEX IF NOT EXISTS idx_file_shares_share_token ON file_shares(share_token)")
  db.run("CREATE INDEX IF NOT EXISTS idx_file_shares_pickup_code ON file_shares(pickup_code)")
  db.run("CREATE INDEX IF NOT EXISTS idx_file_shares_file_id ON file_shares(file_id)")
  db.run("CREATE INDEX IF NOT EXISTS idx_file_shares_user_id ON file_shares(user_id)")
  
  console.log("文件分享表迁移完成！")
  
  // 验证表是否创建成功
  const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='file_shares'").all()
  if (tables.length > 0) {
    console.log("✅ file_shares 表创建成功")
    
    // 显示表结构
    const schema = db.query("PRAGMA table_info(file_shares)").all()
    console.log("表结构:")
    schema.forEach(col => {
      console.log(`  ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.pk ? 'PRIMARY KEY' : ''}`)
    })
  } else {
    console.log("❌ file_shares 表创建失败")
  }
  
} catch (error) {
  console.error("迁移失败:", error)
  process.exit(1)
} finally {
  db.close()
}
