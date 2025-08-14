import Database from "bun:sqlite"
import { join } from "path"

const dbPath = join(process.cwd(), "netdisk.db")
const db = new Database(dbPath)

try {
  console.log("开始执行分享表结构迁移...")
  
  // 检查是否需要迁移
  const tableInfo = db.prepare("PRAGMA table_info(file_shares)").all()
  const shareTokenColumn = tableInfo.find(col => col.name === 'share_token')
  
  if (shareTokenColumn && shareTokenColumn.notnull === 1) {
    console.log("需要迁移 share_token 字段，允许 NULL 值...")
    
    // 创建新表结构
    console.log("创建新的 file_shares 表...")
    db.run(`
      CREATE TABLE file_shares_new (
        id TEXT PRIMARY KEY,
        file_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        share_token TEXT UNIQUE,
        pickup_code TEXT,
        require_login INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1,
        access_count INTEGER NOT NULL DEFAULT 0,
        expires_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)
    
    // 复制数据
    console.log("复制现有数据...")
    db.run(`
      INSERT INTO file_shares_new 
      SELECT * FROM file_shares
    `)
    
    // 删除旧表
    console.log("删除旧表...")
    db.run("DROP TABLE file_shares")
    
    // 重命名新表
    console.log("重命名新表...")
    db.run("ALTER TABLE file_shares_new RENAME TO file_shares")
    
    console.log("✅ 分享表结构迁移完成")
  } else {
    console.log("✅ 分享表结构已是最新版本，无需迁移")
  }
  
} catch (error) {
  console.error("❌ 分享表结构迁移失败:", error)
  process.exit(1)
} finally {
  db.close()
}
