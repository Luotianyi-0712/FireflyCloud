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

      CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        parent_id TEXT,
        path TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (parent_id) REFERENCES folders (id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        folder_id TEXT,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        size INTEGER NOT NULL,
        mime_type TEXT NOT NULL,
        storage_type TEXT NOT NULL,
        storage_path TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (folder_id) REFERENCES folders (id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS storage_config (
        id INTEGER PRIMARY KEY DEFAULT 1,
        storage_type TEXT NOT NULL DEFAULT 'local',
        r2_endpoint TEXT,
        r2_access_key TEXT,
        r2_secret_key TEXT,
        r2_bucket TEXT,
        enable_mixed_mode INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );

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

      CREATE TABLE IF NOT EXISTS download_tokens (
        id TEXT PRIMARY KEY,
        file_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        token TEXT UNIQUE NOT NULL,
        used INTEGER NOT NULL DEFAULT 0,
        usage_count INTEGER NOT NULL DEFAULT 0,
        max_usage INTEGER NOT NULL DEFAULT 2,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS file_direct_links (
        id TEXT PRIMARY KEY,
        file_id TEXT UNIQUE NOT NULL,
        user_id TEXT NOT NULL,
        direct_name TEXT UNIQUE NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        access_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS file_shares (
        id TEXT PRIMARY KEY,
        file_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        share_token TEXT UNIQUE,
        pickup_code TEXT,
        require_login INTEGER NOT NULL DEFAULT 0,
        gatekeeper INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1,
        access_count INTEGER NOT NULL DEFAULT 0,
        expires_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );
    `)

    // 检查并添加 email_verified 字段
    const userColumns = sqlite.prepare("PRAGMA table_info(users)").all()
    const hasEmailVerified = userColumns.some(col => col.name === 'email_verified')

    if (!hasEmailVerified) {
      logger.info('添加 email_verified 字段到 users 表...')
      sqlite.exec('ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0')
      logger.database('ALTER', 'users')
      logger.info('email_verified 字段添加成功')
    }

    // 检查并添加 folder_id 字段到 files 表
    const fileColumns = sqlite.prepare("PRAGMA table_info(files)").all()
    const hasFolderId = fileColumns.some(col => col.name === 'folder_id')

    if (!hasFolderId) {
      logger.info('添加 folder_id 字段到 files 表...')
      sqlite.exec('ALTER TABLE files ADD COLUMN folder_id TEXT')
      logger.database('ALTER', 'files')
      logger.info('folder_id 字段添加成功')
    }

    // 检查并升级 download_tokens 表结构
    const downloadTokensExists = sqlite.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='download_tokens'
    `).get()

    if (downloadTokensExists) {
      const downloadTokenColumns = sqlite.prepare("PRAGMA table_info(download_tokens)").all()
      const hasUsageCount = downloadTokenColumns.some(col => col.name === 'usage_count')
      const hasMaxUsage = downloadTokenColumns.some(col => col.name === 'max_usage')

      if (!hasUsageCount) {
        logger.info('添加 usage_count 字段到 download_tokens 表...')
        sqlite.exec('ALTER TABLE download_tokens ADD COLUMN usage_count INTEGER NOT NULL DEFAULT 0')
        logger.database('ALTER', 'download_tokens')
        logger.info('usage_count 字段添加成功')
      }

      if (!hasMaxUsage) {
        logger.info('添加 max_usage 字段到 download_tokens 表...')
        sqlite.exec('ALTER TABLE download_tokens ADD COLUMN max_usage INTEGER NOT NULL DEFAULT 2')
        logger.database('ALTER', 'download_tokens')
        logger.info('max_usage 字段添加成功')
      }

      // 迁移现有数据：将 used=1 的记录设置为已达到最大使用次数
      if (!hasUsageCount || !hasMaxUsage) {
        logger.info('迁移现有下载令牌数据...')
        const updateResult = sqlite.exec(`
          UPDATE download_tokens
          SET usage_count = CASE
            WHEN used = 1 THEN max_usage
            ELSE 0
          END
          WHERE usage_count = 0 OR usage_count IS NULL
        `)
        logger.info('下载令牌数据迁移完成')
      }
    }

    // 检查并升级 file_shares 表结构
    const fileSharesExists = sqlite.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='file_shares'
    `).get()

    if (fileSharesExists) {
      const fileSharesColumns = sqlite.prepare("PRAGMA table_info(file_shares)").all()
      const hasGatekeeper = fileSharesColumns.some((col: any) => col.name === 'gatekeeper')
      const hasEnabled = fileSharesColumns.some((col: any) => col.name === 'enabled')
      const hasAccessCount = fileSharesColumns.some((col: any) => col.name === 'access_count')
      const hasUpdatedAt = fileSharesColumns.some((col: any) => col.name === 'updated_at')

      if (!hasGatekeeper) {
        logger.info('添加 gatekeeper 字段到 file_shares 表...')
        sqlite.exec('ALTER TABLE file_shares ADD COLUMN gatekeeper INTEGER NOT NULL DEFAULT 0')
        logger.database('ALTER', 'file_shares')
        logger.info('gatekeeper 字段添加成功')
      }

      if (!hasEnabled) {
        logger.info('添加 enabled 字段到 file_shares 表...')
        sqlite.exec('ALTER TABLE file_shares ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1')
        logger.database('ALTER', 'file_shares')
        logger.info('enabled 字段添加成功')
      }

      if (!hasAccessCount) {
        logger.info('添加 access_count 字段到 file_shares 表...')
        sqlite.exec('ALTER TABLE file_shares ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0')
        logger.database('ALTER', 'file_shares')
        logger.info('access_count 字段添加成功')
      }

      if (!hasUpdatedAt) {
        logger.info('添加 updated_at 字段到 file_shares 表...')
        sqlite.exec('ALTER TABLE file_shares ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0')
        logger.database('ALTER', 'file_shares')
        logger.info('updated_at 字段添加成功')
        
        // 更新现有记录的 updated_at 字段
        sqlite.exec(`UPDATE file_shares SET updated_at = created_at WHERE updated_at = 0`)
        logger.info('已更新现有记录的 updated_at 字段')
      }

      // 修复 share_token 字段的 UNIQUE 约束问题
      const shareTokenColumn = fileSharesColumns.find((col: any) => col.name === 'share_token')
      if (shareTokenColumn && (shareTokenColumn as any).notnull === 1) {
        logger.info('修复 share_token 字段约束...')
        // 由于 SQLite 不支持直接修改列约束，我们需要重建表
        sqlite.exec(`
          CREATE TABLE file_shares_new (
            id TEXT PRIMARY KEY,
            file_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            share_token TEXT UNIQUE,
            pickup_code TEXT,
            require_login INTEGER NOT NULL DEFAULT 0,
            gatekeeper INTEGER NOT NULL DEFAULT 0,
            enabled INTEGER NOT NULL DEFAULT 1,
            access_count INTEGER NOT NULL DEFAULT 0,
            expires_at INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
          );
          
          INSERT INTO file_shares_new 
          SELECT id, file_id, user_id, share_token, pickup_code, require_login, 
                 COALESCE(gatekeeper, 0), COALESCE(enabled, 1), COALESCE(access_count, 0), 
                 expires_at, created_at, COALESCE(updated_at, created_at)
          FROM file_shares;
          
          DROP TABLE file_shares;
          ALTER TABLE file_shares_new RENAME TO file_shares;
        `)
        logger.database('REBUILD', 'file_shares')
        logger.info('file_shares 表结构修复完成')
      }
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
