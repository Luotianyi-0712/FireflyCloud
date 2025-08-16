#!/usr/bin/env bun

/**
 * 下载令牌使用次数迁移脚本
 * 
 * 此脚本为 download_tokens 表添加新字段以支持多次使用：
 * - usage_count: 使用次数计数器
 * - max_usage: 最大使用次数（默认2次）
 * 
 * 运行方式: bun run migrate-download-tokens-usage.js
 */

import Database from "bun:sqlite"
import { logger } from "./src/utils/logger.js"

const DB_PATH = process.env.DATABASE_URL || "./netdisk.db"

async function migrateDownloadTokensUsage() {
  logger.info("🔄 开始迁移下载令牌使用次数功能...")

  const db = new Database(DB_PATH)

  try {
    // 检查表是否存在
    const tableExists = db.query(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='download_tokens'
    `).get()

    if (!tableExists) {
      logger.warn("⚠️  download_tokens 表不存在，跳过迁移")
      return
    }

    // 检查新字段是否已存在
    const columns = db.query("PRAGMA table_info(download_tokens)").all()
    const hasUsageCount = columns.some(col => col.name === 'usage_count')
    const hasMaxUsage = columns.some(col => col.name === 'max_usage')

    if (hasUsageCount && hasMaxUsage) {
      logger.info("✅ 新字段已存在，无需迁移")
      return
    }

    logger.info("📝 添加新字段...")

    // 添加 usage_count 字段
    if (!hasUsageCount) {
      db.exec(`
        ALTER TABLE download_tokens 
        ADD COLUMN usage_count INTEGER NOT NULL DEFAULT 0
      `)
      logger.info("✅ 添加 usage_count 字段成功")
    }

    // 添加 max_usage 字段
    if (!hasMaxUsage) {
      db.exec(`
        ALTER TABLE download_tokens 
        ADD COLUMN max_usage INTEGER NOT NULL DEFAULT 2
      `)
      logger.info("✅ 添加 max_usage 字段成功")
    }

    // 迁移现有数据：将 used=true 的记录设置为 usage_count=2（已达到最大使用次数）
    const updateResult = db.exec(`
      UPDATE download_tokens 
      SET usage_count = CASE 
        WHEN used = 1 THEN 2 
        ELSE 0 
      END
      WHERE usage_count = 0
    `)

    logger.info(`✅ 迁移现有数据完成，更新了 ${updateResult.changes} 条记录`)

    // 验证迁移结果
    const stats = db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN used = 1 THEN 1 END) as used_old,
        COUNT(CASE WHEN usage_count >= max_usage THEN 1 END) as used_new,
        COUNT(CASE WHEN usage_count = 0 THEN 1 END) as unused
      FROM download_tokens
    `).get()

    logger.info("📊 迁移统计:")
    logger.info(`   总令牌数: ${stats.total}`)
    logger.info(`   旧字段标记已使用: ${stats.used_old}`)
    logger.info(`   新字段标记已使用: ${stats.used_new}`)
    logger.info(`   未使用令牌: ${stats.unused}`)

    logger.info("✅ 下载令牌使用次数迁移完成！")

  } catch (error) {
    logger.error("❌ 迁移失败:", error)
    throw error
  } finally {
    db.close()
  }
}

// 运行迁移
if (import.meta.main) {
  migrateDownloadTokensUsage()
    .then(() => {
      logger.info("🎉 迁移脚本执行完成")
      process.exit(0)
    })
    .catch((error) => {
      logger.error("💥 迁移脚本执行失败:", error)
      process.exit(1)
    })
}

export { migrateDownloadTokensUsage }
