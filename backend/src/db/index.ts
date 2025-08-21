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
    logger.startup('🔧 开始初始化数据库...')

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
        onedrive_client_id TEXT,
        onedrive_client_secret TEXT,
        onedrive_tenant_id TEXT,
        onedrive_webdav_url TEXT,
        onedrive_webdav_user TEXT,
        onedrive_webdav_pass TEXT,
        enable_mixed_mode INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS storage_strategies (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL,
        config TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
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

      CREATE TABLE IF NOT EXISTS onedrive_auth (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        scope TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS onedrive_mount_points (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        folder_id TEXT NOT NULL,
        onedrive_path TEXT NOT NULL,
        onedrive_item_id TEXT,
        mount_name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (folder_id) REFERENCES folders (id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS webdav_mount_points (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        folder_id TEXT NOT NULL,
        mount_name TEXT NOT NULL,
        webdav_url TEXT NOT NULL,
        username TEXT NOT NULL,
        password_encrypted TEXT NOT NULL,
        base_path TEXT DEFAULT '/',
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
        token TEXT UNIQUE NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        access_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS direct_link_access_logs (
        id TEXT PRIMARY KEY,
        direct_link_id TEXT NOT NULL,
        ip_address TEXT NOT NULL,
        user_agent TEXT,
        country TEXT,
        province TEXT,
        city TEXT,
        isp TEXT,
        accessed_at INTEGER NOT NULL,
        FOREIGN KEY (direct_link_id) REFERENCES file_direct_links (id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS ip_bans (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        direct_link_id TEXT,
        ip_address TEXT NOT NULL,
        reason TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (direct_link_id) REFERENCES file_direct_links (id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS file_shares (
        id TEXT PRIMARY KEY,
        file_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        share_token TEXT UNIQUE,
        pickup_code TEXT,
        require_login INTEGER NOT NULL DEFAULT 0,
        gatekeeper INTEGER NOT NULL DEFAULT 0,
        custom_file_name TEXT,
        custom_file_extension TEXT,
        custom_file_size INTEGER,
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
    const userColumns = sqlite.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>
    const hasEmailVerified = userColumns.some(col => col.name === 'email_verified')

    if (!hasEmailVerified) {
      logger.dbInfo('添加 email_verified 字段到 users 表...')
      sqlite.exec('ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0')
      logger.database('ALTER', 'users')
      logger.dbInfo('email_verified 字段添加成功')
    }

    // 检查并添加 folder_id 字段到 files 表
    const fileColumns = sqlite.prepare("PRAGMA table_info(files)").all() as Array<{ name: string }>
    const hasFolderId = fileColumns.some(col => col.name === 'folder_id')

    if (!hasFolderId) {
      logger.dbInfo('添加 folder_id 字段到 files 表...')
      sqlite.exec('ALTER TABLE files ADD COLUMN folder_id TEXT')
      logger.database('ALTER', 'files')
      logger.dbInfo('folder_id 字段添加成功')
    }

    // 检查并添加 enable_mixed_mode 字段到 storage_config 表
    const storageConfigColumns = sqlite.prepare("PRAGMA table_info(storage_config)").all() as Array<{ name: string }>
    const hasEnableMixedMode = storageConfigColumns.some(col => col.name === 'enable_mixed_mode')

    if (!hasEnableMixedMode) {
      logger.dbInfo('添加 enable_mixed_mode 字段到 storage_config 表...')
      sqlite.exec('ALTER TABLE storage_config ADD COLUMN enable_mixed_mode INTEGER NOT NULL DEFAULT 0')
      logger.database('ALTER', 'storage_config')
      logger.dbInfo('enable_mixed_mode 字段添加成功')
    }

    // 检查并添加 OneDrive 相关字段到 storage_config 表
    const hasOneDriveClientId = storageConfigColumns.some(col => col.name === 'onedrive_client_id')
    const hasOneDriveClientSecret = storageConfigColumns.some(col => col.name === 'onedrive_client_secret')
    const hasOneDriveTenantId = storageConfigColumns.some(col => col.name === 'onedrive_tenant_id')
    const hasOneDriveWebDavUrl = storageConfigColumns.some(col => col.name === 'onedrive_webdav_url')
    const hasOneDriveWebDavUser = storageConfigColumns.some(col => col.name === 'onedrive_webdav_user')
    const hasOneDriveWebDavPass = storageConfigColumns.some(col => col.name === 'onedrive_webdav_pass')

    if (!hasOneDriveClientId) {
      logger.dbInfo('添加 onedrive_client_id 字段到 storage_config 表...')
      sqlite.exec('ALTER TABLE storage_config ADD COLUMN onedrive_client_id TEXT')
      logger.database('ALTER', 'storage_config')
      logger.dbInfo('onedrive_client_id 字段添加成功')
    }

    if (!hasOneDriveClientSecret) {
      logger.dbInfo('添加 onedrive_client_secret 字段到 storage_config 表...')
      sqlite.exec('ALTER TABLE storage_config ADD COLUMN onedrive_client_secret TEXT')
      logger.database('ALTER', 'storage_config')
      logger.dbInfo('onedrive_client_secret 字段添加成功')
    }

    if (!hasOneDriveTenantId) {
      logger.dbInfo('添加 onedrive_tenant_id 字段到 storage_config 表...')
      sqlite.exec('ALTER TABLE storage_config ADD COLUMN onedrive_tenant_id TEXT')
      logger.database('ALTER', 'storage_config')
      logger.dbInfo('onedrive_tenant_id 字段添加成功')
    }

    if (!hasOneDriveWebDavUrl) {
      logger.dbInfo('添加 onedrive_webdav_url 字段到 storage_config 表...')
      sqlite.exec('ALTER TABLE storage_config ADD COLUMN onedrive_webdav_url TEXT')
      logger.database('ALTER', 'storage_config')
      logger.dbInfo('onedrive_webdav_url 字段添加成功')
    }

    if (!hasOneDriveWebDavUser) {
      logger.dbInfo('添加 onedrive_webdav_user 字段到 storage_config 表...')
      sqlite.exec('ALTER TABLE storage_config ADD COLUMN onedrive_webdav_user TEXT')
      logger.database('ALTER', 'storage_config')
      logger.dbInfo('onedrive_webdav_user 字段添加成功')
    }

    if (!hasOneDriveWebDavPass) {
      logger.dbInfo('添加 onedrive_webdav_pass 字段到 storage_config 表...')
      sqlite.exec('ALTER TABLE storage_config ADD COLUMN onedrive_webdav_pass TEXT')
      logger.database('ALTER', 'storage_config')
      logger.dbInfo('onedrive_webdav_pass 字段添加成功')
    }

    // 插入默认数据
    sqlite.exec(`
      INSERT OR IGNORE INTO storage_config (storage_type, updated_at)
      VALUES ('local', ${Date.now()});
    `)

    // 初始化存储策略系统
    await initializeStorageStrategies()

    // 初始化管理员账户
    await initializeAdminAccount()

    // 初始化 SMTP 配置
    const smtpConfigExists = sqlite.prepare("SELECT COUNT(*) as count FROM smtp_config WHERE id = 1").get() as { count: number }
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
        logger.dbInfo('已从环境变量初始化 SMTP 配置（建议在管理面板中管理）')
      } else {
        // 创建默认的禁用配置
        sqlite.exec(`
          INSERT INTO smtp_config (id, enabled, host, port, user, pass, secure, updated_at)
          VALUES (1, 0, '', 465, '', '', 1, ${Date.now()})
        `)
        logger.database('INSERT', 'smtp_config')
        logger.dbInfo('已创建默认 SMTP 配置（禁用状态），请在管理面板中配置')
      }
    }

    // 初始化用户配额系统
    await initializeQuotaSystem()

    // 验证所有表是否正确创建
    await validateDatabaseTables()

    logger.startup('数据库初始化完成')
  } catch (error) {
    logger.error('数据库初始化失败:', error)
    throw error
  }
}

// 初始化存储策略系统
async function initializeStorageStrategies() {
  try {
    logger.info('🔧 初始化存储策略系统...')

    // 检查是否已有存储策略
    const existingStrategies = sqlite.prepare("SELECT COUNT(*) as count FROM storage_strategies").get() as { count: number }

    if (existingStrategies.count === 0) {
      logger.dbInfo('创建默认本地存储策略...')
      
      const { nanoid } = await import('nanoid')
      const strategyId = nanoid()
      const now = Date.now()

      sqlite.exec(`
        INSERT INTO storage_strategies (id, name, type, config, is_active, created_at, updated_at)
        VALUES ('${strategyId}', '默认本地存储', 'local', '{}', 1, ${now}, ${now})
      `)
      
      logger.database('INSERT', 'storage_strategies')
      logger.dbInfo('✅ 默认本地存储策略创建成功')
    } else {
      logger.dbInfo('存储策略已存在，跳过初始化')
    }

    logger.dbInfo('存储策略系统初始化完成')
  } catch (error) {
    logger.error('存储策略系统初始化失败:', error)
    throw error
  }
}

// 初始化用户配额系统
async function initializeQuotaSystem() {
  try {
    logger.info('🔧 初始化用户配额系统...')

    // 初始化角色默认配额配置
    const adminQuotaExists = sqlite.prepare("SELECT COUNT(*) as count FROM role_quota_config WHERE role = 'admin'").get() as { count: number }
    const userQuotaExists = sqlite.prepare("SELECT COUNT(*) as count FROM role_quota_config WHERE role = 'user'").get() as { count: number }

    if (adminQuotaExists.count === 0) {
      const adminQuotaId = `quota_admin_${Date.now()}`
      sqlite.exec(`
        INSERT INTO role_quota_config (id, role, default_quota, description, created_at, updated_at)
        VALUES ('${adminQuotaId}', 'admin', ${10 * 1024 * 1024 * 1024}, '管理员默认配额：10GB', ${Date.now()}, ${Date.now()})
      `)
      logger.database('INSERT', 'role_quota_config')
      logger.dbInfo('已创建管理员默认配额配置：10GB')
    }

    if (userQuotaExists.count === 0) {
      const userQuotaId = `quota_user_${Date.now()}`
      sqlite.exec(`
        INSERT INTO role_quota_config (id, role, default_quota, description, created_at, updated_at)
        VALUES ('${userQuotaId}', 'user', ${1 * 1024 * 1024 * 1024}, '普通用户默认配额：1GB', ${Date.now()}, ${Date.now()})
      `)
      logger.database('INSERT', 'role_quota_config')
      logger.dbInfo('已创建普通用户默认配额配置：1GB')
    }

    // 为现有用户创建配额记录
    const usersWithoutQuota = sqlite.prepare(`
      SELECT u.id, u.role
      FROM users u
      LEFT JOIN user_quotas uq ON u.id = uq.user_id
      WHERE uq.user_id IS NULL
    `).all() as Array<{ id: string; role: string }>

    for (const user of usersWithoutQuota) {
      const quotaConfig = sqlite.prepare("SELECT default_quota FROM role_quota_config WHERE role = ?").get(user.role) as { default_quota: number } | undefined
      const defaultQuota = quotaConfig ? quotaConfig.default_quota : (user.role === 'admin' ? 10 * 1024 * 1024 * 1024 : 1 * 1024 * 1024 * 1024)

      // 计算用户当前使用量（包括本地存储和R2存储）
      const userFiles = sqlite.prepare("SELECT COALESCE(SUM(size), 0) as total_size FROM files WHERE user_id = ?").get(user.id) as { total_size: number }
      const totalUsedStorage = userFiles ? userFiles.total_size : 0

      // 分别统计本地存储和R2存储（用于日志）
      const localFiles = sqlite.prepare("SELECT COALESCE(SUM(size), 0) as local_size FROM files WHERE user_id = ? AND storage_type = 'local'").get(user.id) as { local_size: number }
      const r2Files = sqlite.prepare("SELECT COALESCE(SUM(size), 0) as r2_size FROM files WHERE user_id = ? AND storage_type = 'r2'").get(user.id) as { r2_size: number }
      const localStorage = localFiles ? localFiles.local_size : 0
      const r2Storage = r2Files ? r2Files.r2_size : 0

      const quotaId = `quota_${user.id}_${Date.now()}`
      sqlite.exec(`
        INSERT INTO user_quotas (id, user_id, max_storage, used_storage, role, created_at, updated_at)
        VALUES ('${quotaId}', '${user.id}', ${defaultQuota}, ${totalUsedStorage}, '${user.role}', ${Date.now()}, ${Date.now()})
      `)
      logger.database('INSERT', 'user_quotas')
      logger.dbInfo(`已为用户 ${user.id} (${user.role}) 创建配额记录：${Math.round(defaultQuota / 1024 / 1024 / 1024)}GB，已使用：${Math.round(totalUsedStorage / 1024 / 1024)}MB (本地: ${Math.round(localStorage / 1024 / 1024)}MB, R2: ${Math.round(r2Storage / 1024 / 1024)}MB)`)
    }

    logger.dbInfo('用户配额系统初始化完成')
  } catch (error) {
    logger.error('用户配额系统初始化失败:', error)
    throw error
  }
}

// 验证数据库表是否正确创建
async function validateDatabaseTables() {
  try {
    logger.dbInfo('🔍 验证数据库表结构...')

    // 定义所有应该存在的表
    const requiredTables = [
      'users',
      'folders',
      'files',
      'storage_config',
      'storage_strategies',
      'r2_mount_points',
      'onedrive_auth',
      'onedrive_mount_points',
      'webdav_mount_points',
      'email_verification_codes',
      'smtp_config',
      'download_tokens',
      'file_direct_links',
      'direct_link_access_logs',
      'ip_bans',
      'file_shares',
      'user_quotas',
      'role_quota_config'
    ]

    // 获取数据库中实际存在的表
    const existingTables = sqlite.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `).all().map((row: any) => row.name)

    // 检查缺失的表
    const missingTables = requiredTables.filter(table => !existingTables.includes(table))

    if (missingTables.length > 0) {
      logger.error(`❌ 缺失的数据库表: ${missingTables.join(', ')}`)
      throw new Error(`数据库表不完整，缺失: ${missingTables.join(', ')}`)
    }

    // 检查额外的表（可能是旧版本遗留）
    const extraTables = existingTables.filter(table => !requiredTables.includes(table))
    if (extraTables.length > 0) {
      logger.dbInfo(`ℹ️ 发现额外的表（可能是旧版本遗留）: ${extraTables.join(', ')}`)
    }

    logger.dbInfo(`✅ 数据库表验证通过，共 ${requiredTables.length} 个表`)

    // 记录每个表的记录数
    for (const table of requiredTables) {
      try {
        const count = sqlite.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number }
        logger.debug(`  ${table}: ${count.count} 条记录`)
      } catch (error: any) {
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
    const adminExists = sqlite.prepare("SELECT COUNT(*) as count FROM users WHERE id = 'admin'").get() as { count: number }

    if (adminExists.count === 0) {
      // 生成随机密码
      const { plainPassword, hashedPassword } = await generateAdminPassword()

      // 创建管理员账户
      sqlite.exec(`
        INSERT INTO users (id, email, password, role, email_verified, created_at, updated_at)
        VALUES ('admin', 'admin@cialloo.site', '${hashedPassword}', 'admin', 1, ${Date.now()}, ${Date.now()})
      `)

      logger.database('INSERT', 'users')
      logger.dbInfo('✅ 管理员账户创建成功')

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
      logger.dbInfo('管理员账户已存在，跳过创建')
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

export { sqlite }