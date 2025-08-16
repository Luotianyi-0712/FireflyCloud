#!/usr/bin/env bun

import Database from "bun:sqlite"

const dbPath = process.env.DATABASE_URL || "./netdisk.db"
const db = new Database(dbPath)

console.log("🔄 开始 R2 挂载点数据库迁移...")

try {
  // 添加 enable_mixed_mode 字段到 storage_config 表
  console.log("📝 添加混合模式字段到存储配置表...")
  try {
    db.exec(`
      ALTER TABLE storage_config 
      ADD COLUMN enable_mixed_mode INTEGER NOT NULL DEFAULT 0
    `)
    console.log("✅ 混合模式字段添加成功")
  } catch (error) {
    if (error.message.includes("duplicate column name")) {
      console.log("ℹ️  混合模式字段已存在，跳过")
    } else {
      throw error
    }
  }

  // 创建 R2 挂载点表
  console.log("📝 创建 R2 挂载点表...")
  db.exec(`
    CREATE TABLE IF NOT EXISTS r2_mount_points (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      folder_id TEXT NOT NULL,
      r2_path TEXT NOT NULL,
      mount_name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (folder_id) REFERENCES folders (id) ON DELETE CASCADE
    )
  `)
  console.log("✅ R2 挂载点表创建成功")

  // 创建索引以提高查询性能
  console.log("📝 创建索引...")
  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_r2_mount_points_user_id ON r2_mount_points(user_id)
    `)
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_r2_mount_points_folder_id ON r2_mount_points(folder_id)
    `)
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_r2_mount_points_enabled ON r2_mount_points(enabled)
    `)
    console.log("✅ 索引创建成功")
  } catch (error) {
    console.log("ℹ️  索引可能已存在，跳过")
  }

  console.log("🎉 R2 挂载点数据库迁移完成！")
  console.log("")
  console.log("新功能说明:")
  console.log("- 支持混合存储模式（本地 + R2）")
  console.log("- 可以将 R2 存储桶目录挂载到本地文件夹")
  console.log("- R2 文件支持直接下载，不经过后端")
  console.log("- 在文件管理界面中可以看到 R2 挂载状态")

} catch (error) {
  console.error("❌ 迁移失败:", error)
  process.exit(1)
} finally {
  db.close()
}
