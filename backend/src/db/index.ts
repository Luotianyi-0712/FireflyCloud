import { drizzle } from "drizzle-orm/bun-sqlite"
import { Database } from "bun:sqlite"
import * as schema from "./schema"
import { logger } from "../utils/logger"
import { generateAdminPassword } from "../utils/password"

const sqlite = new Database(process.env.DATABASE_URL || "./netdisk.db")
export const db = drizzle(sqlite, { schema })

// Initialize database with auto-migration
async function initializeDatabase() {
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
        used INTEGER NOT NULL DEFAULT 0,
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

      CREATE TABLE IF NOT EXISTS user_quotas (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        max_storage INTEGER NOT NULL,
        used_storage INTEGER NOT NULL DEFAULT 0,
        role TEXT NOT NULL DEFAULT 'user',
        custom_quota INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS role_quota_config (
        id TEXT PRIMARY KEY,
        role TEXT UNIQUE NOT NULL,
        default_quota INTEGER NOT NULL,
        description TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
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

    // 检查并添加 enable_mixed_mode 字段到 storage_config 表
    const storageConfigColumns = sqlite.prepare("PRAGMA table_info(storage_config)").all()
    const hasEnableMixedMode = storageConfigColumns.some(col => col.name === 'enable_mixed_mode')

    if (!hasEnableMixedMode) {
      logger.info('添加 enable_mixed_mode 字段到 storage_config 表...')
      sqlite.exec('ALTER TABLE storage_config ADD COLUMN enable_mixed_mode INTEGER NOT NULL DEFAULT 0')
      logger.database('ALTER', 'storage_config')
      logger.info('enable_mixed_mode 字段添加成功')
    }

    // 检查并修复 email_verification_codes 表的 used 字段约束
    const emailVerificationExists = sqlite.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='email_verification_codes'
    `).get()

    if (emailVerificationExists) {
      const emailVerificationColumns = sqlite.prepare("PRAGMA table_info(email_verification_codes)").all()
      const usedColumn = emailVerificationColumns.find(col => col.name === 'used')

      if (usedColumn && usedColumn.notnull === 0) {
        logger.info('修复 email_verification_codes 表的 used 字段约束...')
        // 由于 SQLite 不支持直接修改列约束，我们需要重建表
        sqlite.exec(`
          CREATE TABLE email_verification_codes_new (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            code TEXT NOT NULL,
            expires_at INTEGER NOT NULL,
            used INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL
          );

          INSERT INTO email_verification_codes_new
          SELECT id, email, code, expires_at, COALESCE(used, 0), created_at
          FROM email_verification_codes;

          DROP TABLE email_verification_codes;
          ALTER TABLE email_verification_codes_new RENAME TO email_verification_codes;
        `)
        logger.database('REBUILD', 'email_verification_codes')
        logger.info('email_verification_codes 表结构修复完成')
      }
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
    `)

    // 初始化管理员账户
    await initializeAdminAccount()

    // 初始化 SMTP 配置
    const smtpConfigExists = sqlite.prepare("SELECT COUNT(*) as count FROM smtp_config WHERE id = 1").get()
    if (smtpConfigExists.count === 0) {
      // 检查环境变量中是否有 SMTP 配置（可选）
      const hasEnvConfig = process.env.SMTP_HOST && process.env.SMTP_PORT &&
                          process.env.SMTP_USER && process.env.SMTP_PASS

      if (hasEnvConfig) {
        // 从环境变量初始化配置（兼容旧版本）
        sqlite.exec(`
          INSERT INTO smtp_config (id, enabled, host, port, user, pass, secure, updated_at)
          VALUES (1, 1, '${process.env.SMTP_HOST}', ${parseInt(process.env.SMTP_PORT || "465")},
                  '${process.env.SMTP_USER}', '${process.env.SMTP_PASS}', 1, ${Date.now()})
        `)
        logger.database('INSERT', 'smtp_config')
        logger.info('已从环境变量初始化 SMTP 配置（建议在管理面板中管理）')
      } else {
        // 创建默认的禁用配置
        sqlite.exec(`
          INSERT INTO smtp_config (id, enabled, host, port, user, pass, secure, updated_at)
          VALUES (1, 0, '', 465, '', '', 1, ${Date.now()})
        `)
        logger.database('INSERT', 'smtp_config')
        logger.info('已创建默认 SMTP 配置（禁用状态），请在管理面板中配置')
      }
    }

    // 初始化用户配额系统
    await initializeQuotaSystem()

    // 验证所有表是否正确创建
    await validateDatabaseTables()

    logger.info('数据库初始化完成')
  } catch (error) {
    logger.error('数据库初始化失败:', error)
    throw error
  }
}

// 初始化用户配额系统
async function initializeQuotaSystem() {
  try {
    logger.info('🔧 初始化用户配额系统...')

    // 初始化角色默认配额配置
    const adminQuotaExists = sqlite.prepare("SELECT COUNT(*) as count FROM role_quota_config WHERE role = 'admin'").get()
    const userQuotaExists = sqlite.prepare("SELECT COUNT(*) as count FROM role_quota_config WHERE role = 'user'").get()

    if (adminQuotaExists.count === 0) {
      const adminQuotaId = `quota_admin_${Date.now()}`
      sqlite.exec(`
        INSERT INTO role_quota_config (id, role, default_quota, description, created_at, updated_at)
        VALUES ('${adminQuotaId}', 'admin', ${10 * 1024 * 1024 * 1024}, '管理员默认配额：10GB', ${Date.now()}, ${Date.now()})
      `)
      logger.database('INSERT', 'role_quota_config')
      logger.info('已创建管理员默认配额配置：10GB')
    }

    if (userQuotaExists.count === 0) {
      const userQuotaId = `quota_user_${Date.now()}`
      sqlite.exec(`
        INSERT INTO role_quota_config (id, role, default_quota, description, created_at, updated_at)
        VALUES ('${userQuotaId}', 'user', ${1 * 1024 * 1024 * 1024}, '普通用户默认配额：1GB', ${Date.now()}, ${Date.now()})
      `)
      logger.database('INSERT', 'role_quota_config')
      logger.info('已创建普通用户默认配额配置：1GB')
    }

    // 为现有用户创建配额记录
    const usersWithoutQuota = sqlite.prepare(`
      SELECT u.id, u.role
      FROM users u
      LEFT JOIN user_quotas uq ON u.id = uq.user_id
      WHERE uq.user_id IS NULL
    `).all()

    for (const user of usersWithoutQuota) {
      const quotaConfig = sqlite.prepare("SELECT default_quota FROM role_quota_config WHERE role = ?").get(user.role)
      const defaultQuota = quotaConfig ? quotaConfig.default_quota : (user.role === 'admin' ? 10 * 1024 * 1024 * 1024 : 1 * 1024 * 1024 * 1024)

      // 计算用户当前使用量（包括本地存储和R2存储）
      const userFiles = sqlite.prepare("SELECT COALESCE(SUM(size), 0) as total_size FROM files WHERE user_id = ?").get(user.id)
      const totalUsedStorage = userFiles ? userFiles.total_size : 0

      // 分别统计本地存储和R2存储（用于日志）
      const localFiles = sqlite.prepare("SELECT COALESCE(SUM(size), 0) as local_size FROM files WHERE user_id = ? AND storage_type = 'local'").get(user.id)
      const r2Files = sqlite.prepare("SELECT COALESCE(SUM(size), 0) as r2_size FROM files WHERE user_id = ? AND storage_type = 'r2'").get(user.id)
      const localStorage = localFiles ? localFiles.local_size : 0
      const r2Storage = r2Files ? r2Files.r2_size : 0

      const quotaId = `quota_${user.id}_${Date.now()}`
      sqlite.exec(`
        INSERT INTO user_quotas (id, user_id, max_storage, used_storage, role, created_at, updated_at)
        VALUES ('${quotaId}', '${user.id}', ${defaultQuota}, ${totalUsedStorage}, '${user.role}', ${Date.now()}, ${Date.now()})
      `)
      logger.database('INSERT', 'user_quotas')
      logger.info(`已为用户 ${user.id} (${user.role}) 创建配额记录：${Math.round(defaultQuota / 1024 / 1024 / 1024)}GB，已使用：${Math.round(totalUsedStorage / 1024 / 1024)}MB (本地: ${Math.round(localStorage / 1024 / 1024)}MB, R2: ${Math.round(r2Storage / 1024 / 1024)}MB)`)
    }

    logger.info('用户配额系统初始化完成')
  } catch (error) {
    logger.error('用户配额系统初始化失败:', error)
    throw error
  }
}

// 验证数据库表是否正确创建
async function validateDatabaseTables() {
  try {
    logger.info('🔍 验证数据库表结构...')

    // 定义所有应该存在的表
    const requiredTables = [
      'users',
      'folders',
      'files',
      'storage_config',
      'r2_mount_points',
      'email_verification_codes',
      'smtp_config',
      'download_tokens',
      'file_direct_links',
      'file_shares',
      'user_quotas',
      'role_quota_config'
    ]

    // 获取数据库中实际存在的表
    const existingTables = sqlite.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `).all().map(row => row.name)

    // 检查缺失的表
    const missingTables = requiredTables.filter(table => !existingTables.includes(table))

    if (missingTables.length > 0) {
      logger.error(`❌ 缺失的数据库表: ${missingTables.join(', ')}`)
      throw new Error(`数据库表不完整，缺失: ${missingTables.join(', ')}`)
    }

    // 检查额外的表（可能是旧版本遗留）
    const extraTables = existingTables.filter(table => !requiredTables.includes(table))
    if (extraTables.length > 0) {
      logger.info(`ℹ️ 发现额外的表（可能是旧版本遗留）: ${extraTables.join(', ')}`)
    }

    logger.info(`✅ 数据库表验证通过，共 ${requiredTables.length} 个表`)

    // 记录每个表的记录数
    for (const table of requiredTables) {
      try {
        const count = sqlite.prepare(`SELECT COUNT(*) as count FROM ${table}`).get()
        logger.debug(`  ${table}: ${count.count} 条记录`)
      } catch (error) {
        logger.warn(`  ${table}: 无法获取记录数 - ${error.message}`)
      }
    }

  } catch (error) {
    logger.error('数据库表验证失败:', error)
    throw error
  }
}

// 初始化管理员账户
async function initializeAdminAccount() {
  try {
    logger.info('🔧 初始化管理员账户...')

    // 检查管理员账户是否已存在
    const adminExists = sqlite.prepare("SELECT COUNT(*) as count FROM users WHERE id = 'admin'").get()

    if (adminExists.count === 0) {
      // 生成随机密码
      const { plainPassword, hashedPassword } = await generateAdminPassword()

      // 创建管理员账户
      sqlite.exec(`
        INSERT INTO users (id, email, password, role, email_verified, created_at, updated_at)
        VALUES ('admin', 'admin@cialloo.site', '${hashedPassword}', 'admin', 1, ${Date.now()}, ${Date.now()})
      `)

      logger.database('INSERT', 'users')
      logger.info('✅ 管理员账户创建成功')

      // 在控制台显示登录信息
      console.log('\n' + '='.repeat(80))
      console.log('🔐 管理员账户信息')
      console.log('='.repeat(80))
      console.log(`📧 登录邮箱: admin@cialloo.site`)
      console.log(`🔑 登录密码: ${plainPassword}`)
      console.log('='.repeat(80))
      console.log('⚠️  请妥善保存上述密码，首次登录后建议在管理面板中修改密码')
      console.log('='.repeat(80) + '\n')

    } else {
      logger.info('管理员账户已存在，跳过创建')
    }
  } catch (error) {
    logger.error('管理员账户初始化失败:', error)
    throw error
  }
}

// 执行初始化
initializeDatabase().catch(error => {
  logger.error('数据库初始化失败:', error)
  process.exit(1)
})
