import { drizzle } from "drizzle-orm/bun-sqlite"
import { Database } from "bun:sqlite"
import * as schema from "./schema"
import { logger } from "../utils/logger"

const sqlite = new Database(process.env.DATABASE_PATH || "./netdisk.db")
export const db = drizzle(sqlite, { schema })

// Initialize database with auto-migration
function initializeDatabase() {
  try {
    logger.info('🔧 开始初始化数据库...')

    // 创建基础表
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

      CREATE TABLE IF NOT EXISTS email_verification_codes (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        code TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        used INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS smtp_config (
        id INTEGER PRIMARY KEY DEFAULT 1,
        enabled INTEGER DEFAULT 0,
        host TEXT,
        port INTEGER DEFAULT 465,
        user TEXT,
        pass TEXT,
        secure INTEGER DEFAULT 1,
        email_template TEXT,
        updated_at INTEGER NOT NULL
      );
    `)

    // 检查并添加 email_verified 字段
    const columns = sqlite.prepare("PRAGMA table_info(users)").all()
    const hasEmailVerified = columns.some(col => col.name === 'email_verified')

    if (!hasEmailVerified) {
      logger.info('添加 email_verified 字段到 users 表...')
      sqlite.exec('ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0')
      logger.database('ALTER', 'users')
      logger.info('email_verified 字段添加成功')
    }

    // 插入默认数据
    sqlite.exec(`
      INSERT OR IGNORE INTO storage_config (storage_type, updated_at)
      VALUES ('local', ${Date.now()});

      INSERT OR IGNORE INTO users (id, email, password, role, email_verified, created_at, updated_at)
      VALUES ('admin', 'admin@cialloo.site', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin', 1, ${Date.now()}, ${Date.now()});
    `)

    // 初始化 SMTP 配置
    const smtpConfigExists = sqlite.prepare("SELECT COUNT(*) as count FROM smtp_config WHERE id = 1").get()
    if (smtpConfigExists.count === 0) {
      // 检查环境变量中是否有 SMTP 配置
      const hasEnvConfig = process.env.SMTP_HOST && process.env.SMTP_PORT &&
                          process.env.SMTP_USER && process.env.SMTP_PASS

      if (hasEnvConfig) {
        // 从环境变量初始化配置
        sqlite.exec(`
          INSERT INTO smtp_config (id, enabled, host, port, user, pass, secure, updated_at)
          VALUES (1, 1, '${process.env.SMTP_HOST}', ${parseInt(process.env.SMTP_PORT || "465")},
                  '${process.env.SMTP_USER}', '${process.env.SMTP_PASS}', 1, ${Date.now()})
        `)
        logger.database('INSERT', 'smtp_config')
        logger.info('已从环境变量初始化 SMTP 配置')
      } else {
        // 创建默认的禁用配置
        sqlite.exec(`
          INSERT INTO smtp_config (id, enabled, host, port, user, pass, secure, updated_at)
          VALUES (1, 0, '', 465, '', '', 1, ${Date.now()})
        `)
        logger.database('INSERT', 'smtp_config')
        logger.info('已创建默认 SMTP 配置（禁用状态）')
      }
    }

    logger.info('数据库初始化完成')
  } catch (error) {
    logger.error('数据库初始化失败:', error)
    throw error
  }
}

// 执行初始化
initializeDatabase()
