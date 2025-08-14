import Database from "bun:sqlite"
import { join } from "path"

const dbPath = join(process.cwd(), "netdisk.db")
const db = new Database(dbPath)

try {
  console.log("测试下载令牌表...")
  
  // 检查表是否存在
  const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='download_tokens'").all()
  console.log("下载令牌表:", tables)
  
  // 检查表结构
  const schema = db.query("PRAGMA table_info(download_tokens)").all()
  console.log("表结构:")
  schema.forEach(col => {
    console.log(`  ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.pk ? 'PRIMARY KEY' : ''}`)
  })
  
  // 检查索引
  const indexes = db.query("PRAGMA index_list(download_tokens)").all()
  console.log("索引:")
  indexes.forEach(idx => {
    console.log(`  ${idx.name}: ${idx.unique ? 'UNIQUE' : 'NON-UNIQUE'}`)
  })
  
  console.log("✅ 下载令牌表测试完成")
  
} catch (error) {
  console.error("❌ 测试失败:", error)
} finally {
  db.close()
}
