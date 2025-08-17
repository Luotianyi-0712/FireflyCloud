import { Elysia, t } from "elysia"
import { jwt } from "@elysiajs/jwt"
import { bearer } from "@elysiajs/bearer"
import { db } from "../db"
import { users, files, smtpConfig, emailVerificationCodes, storageConfig, r2MountPoints, folders, userQuotas, roleQuotaConfig } from "../db/schema"
import { eq, desc, and, like, or } from "drizzle-orm"
import { nanoid } from "nanoid"
import { sendVerificationEmail } from "../services/email"
import { StorageService } from "../services/storage"
import { logger } from "../utils/logger"
import { hashPassword, verifyPassword, validatePasswordStrength } from "../utils/password"

export const adminRoutes = new Elysia({ prefix: "/admin" })
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET!,
    }),
  )
  .use(bearer())
  .derive(async ({ jwt, bearer, set }) => {
    if (!bearer) {
      set.status = 401
      throw new Error("No token provided")
    }

    const payload = await jwt.verify(bearer)
    if (!payload || payload.role !== "admin") {
      set.status = 403
      throw new Error("Admin access required")
    }

    return { user: payload }
  })
  .get("/stats", async () => {
    try {
      const totalUsers = await db.select().from(users).all()
      const totalFiles = await db.select().from(files).all()

      // 计算数据库中记录的存储使用量
      const totalStorage = totalFiles.reduce((sum, file) => sum + file.size, 0)
      const r2FilesInDB = totalFiles.filter(file => file.storageType === "r2")
      const r2StorageInDB = r2FilesInDB.reduce((sum, file) => sum + file.size, 0)
      const localFiles = totalFiles.filter(file => file.storageType === "local")
      const localStorage = localFiles.reduce((sum, file) => sum + file.size, 0)

      // 获取存储配置
      const config = await db.select().from(storageConfig).get()

      // 初始化R2实际使用量
      let r2ActualStorage = 0
      let r2ActualFiles = 0
      let r2StorageError: string | undefined

      // 如果配置了R2存储，查询实际使用量
      if (config && (config.storageType === "r2" || config.enableMixedMode) && config.r2Endpoint) {
        try {
          logger.debug("查询R2存储桶实际使用量")
          const storageService = new StorageService(config)
          const r2Stats = await storageService.calculateR2StorageUsage()

          if (r2Stats.error) {
            r2StorageError = r2Stats.error
            logger.warn(`R2存储统计失败: ${r2Stats.error}`)
          } else {
            r2ActualStorage = r2Stats.totalSize
            r2ActualFiles = r2Stats.totalFiles
            logger.info(`R2实际使用量: ${r2ActualFiles} 个文件，${r2ActualStorage} 字节`)
          }
        } catch (error) {
          r2StorageError = error instanceof Error ? error.message : "Unknown error"
          logger.error("查询R2存储使用量失败:", error)
        }
      }

      // 计算总存储（本地存储 + R2实际存储）
      const actualTotalStorage = localStorage + r2ActualStorage

      logger.info(`统计信息汇总: 用户${totalUsers.length}, 数据库文件${totalFiles.length}, 本地存储${localStorage}, R2实际存储${r2ActualStorage}, 总存储${actualTotalStorage}`)

      return {
        totalUsers: totalUsers.length,
        totalFiles: totalFiles.length,
        totalStorage: actualTotalStorage, // 使用实际总存储

        // R2存储信息（实际）
        r2Storage: r2ActualStorage,
        r2Files: r2ActualFiles,
        r2StorageError,

        // 本地存储信息
        localStorage,
        localFiles: localFiles.length,

        // 数据库中的R2记录（用于对比）
        r2StorageInDB,
        r2FilesInDB: r2FilesInDB.length,

        // 用户统计
        adminUsers: totalUsers.filter((u) => u.role === "admin").length,
        regularUsers: totalUsers.filter((u) => u.role === "user").length,

        // 存储配置信息
        storageType: config?.storageType || "local",
        enableMixedMode: config?.enableMixedMode || false,
      }
    } catch (error) {
      logger.error("获取统计信息失败:", error)
      return {
        totalUsers: 0,
        totalFiles: 0,
        totalStorage: 0,
        r2Storage: 0,
        localStorage: 0,
        r2Files: 0,
        localFiles: 0,
        r2StorageInDB: 0,
        r2FilesInDB: 0,
        adminUsers: 0,
        regularUsers: 0,
        storageType: "local",
        enableMixedMode: false,
        r2StorageError: "Failed to fetch stats"
      }
    }
  })
  .get("/users", async () => {
    const allUsers = await db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)

    return { users: allUsers }
  })
  .get("/files", async () => {
    const allFiles = await db.select().from(files).all()
    return { files: allFiles }
  })
  .delete("/users/:id", async ({ params, set }) => {
    try {
      if (params.id === "admin") {
        set.status = 400
        return { error: "Cannot delete admin user" }
      }

      // Delete user's files first
      await db.delete(files).where(eq(files.userId, params.id))

      // Delete user
      await db.delete(users).where(eq(users.id, params.id))

      return { message: "User deleted successfully" }
    } catch (error) {
      set.status = 500
      return { error: "Delete failed" }
    }
  })
  .delete("/files/:id", async ({ params, set }) => {
    try {
      await db.delete(files).where(eq(files.id, params.id))
      return { message: "File deleted successfully" }
    } catch (error) {
      set.status = 500
      return { error: "Delete failed" }
    }
  })
  .get("/smtp-config", async ({ set }) => {
    try {
      // 获取数据库中的配置
      const config = await db.select().from(smtpConfig).get()

      // 如果数据库中没有配置，返回环境变量中的配置
      if (!config) {
        return {
          enabled: false,
          host: process.env.SMTP_HOST || "",
          port: parseInt(process.env.SMTP_PORT || "465"),
          user: process.env.SMTP_USER || "",
          pass: process.env.SMTP_PASS || "",
          secure: true,
          emailTemplate: ""
        }
      }

      return {
        enabled: config.enabled,
        host: config.host || "",
        port: config.port || 465,
        user: config.user || "",
        pass: config.pass || "",
        secure: config.secure,
        emailTemplate: config.emailTemplate || ""
      }
    } catch (error) {
      logger.error("Failed to get SMTP config:", error)
      set.status = 500
      return {
        error: "Failed to get SMTP configuration",
        config: {
          enabled: false,
          host: "",
          port: 465,
          user: "",
          pass: "",
          secure: true,
          emailTemplate: ""
        }
      }
    }
  })
  .put(
    "/smtp-config",
    async ({ body, set }) => {
      try {
        const { enabled, host, port, user, pass, secure, emailTemplate } = body

        const now = Date.now()

        // 检查是否已存在配置
        const existingConfig = await db.select().from(smtpConfig).get()

        if (existingConfig) {
          // 更新现有配置
          await db
            .update(smtpConfig)
            .set({
              enabled,
              host,
              port,
              user,
              pass,
              secure,
              emailTemplate,
              updatedAt: now,
            })
            .where(eq(smtpConfig.id, 1))
        } else {
          // 创建新配置
          await db.insert(smtpConfig).values({
            id: 1,
            enabled,
            host,
            port,
            user,
            pass,
            secure,
            emailTemplate,
            updatedAt: now,
          })
        }

        logger.info("SMTP configuration updated successfully")
        return { message: "SMTP configuration updated successfully" }
      } catch (error) {
        logger.error("Failed to update SMTP config:", error)
        set.status = 500
        return { error: "Failed to update SMTP configuration" }
      }
    },
    {
      body: t.Object({
        enabled: t.Boolean(),
        host: t.String(),
        port: t.Number(),
        user: t.String(),
        pass: t.String(),
        secure: t.Boolean(),
        emailTemplate: t.String(),
      }),
    }
  )
  .post(
    "/test-smtp",
    async ({ body, set }) => {
      try {
        const { email, config } = body

        logger.info('收到测试邮件请求', { email, config: { ...config, pass: '***' } })

        // 验证必要的配置
        if (!config.host || !config.port || !config.user || !config.pass) {
          set.status = 400
          return { error: "SMTP 配置不完整，请检查主机、端口、用户名和密码" }
        }

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          set.status = 400
          return { error: "请提供有效的邮箱地址" }
        }

        // 生成测试验证码
        const testCode = "123456"

        // 使用提供的配置发送测试邮件
        const success = await sendTestEmail(email, testCode, config)

        if (success) {
          return { message: "Test email sent successfully" }
        } else {
          set.status = 500
          return { error: "Failed to send test email" }
        }
      } catch (error) {
        logger.error("Failed to send test email:", error)
        set.status = 500
        return { error: `发送测试邮件失败: ${error.message}` }
      }
    },
    {
      body: t.Object({
        email: t.String(),
        config: t.Object({
          enabled: t.Boolean(),
          host: t.String(),
          port: t.Number(),
          user: t.String(),
          pass: t.String(),
          secure: t.Boolean(),
          emailTemplate: t.String(),
        }),
      }),
    }
  )

// 发送测试邮件的函数
async function sendTestEmail(email: string, code: string, config: any): Promise<boolean> {
  try {
    logger.info(`开始发送测试邮件到: ${email}`)
    logger.debug('SMTP 配置:', {
      host: config.host,
      port: config.port,
      user: config.user,
      secure: config.secure
    })

    const nodemailer = await import('nodemailer')

    const transporter = nodemailer.default.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    })

    // 首先验证连接
    await transporter.verify()
    logger.info('SMTP 连接验证成功')

    const template = config.emailTemplate || `
      <!DOCTYPE html>
      <html lang="zh-CN">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>FireflyCloud SMTP 测试</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: hsl(0, 0%, 3.9%); background-color: hsl(0, 0%, 96.1%); padding: 20px; margin: 0;">
          <div style="max-width: 600px; margin: 0 auto; background-color: hsl(0, 0%, 100%); border: 1px solid hsl(0, 0%, 89.8%); border-radius: 8px; overflow: hidden;">
              <div style="background-color: hsl(0, 0%, 9%); color: hsl(0, 0%, 98%); padding: 32px; text-align: center;">
                  <h1 style="font-size: 24px; font-weight: 600; margin: 0;">FireflyCloud</h1>
                  <p style="color: hsl(0, 0%, 71%); font-size: 14px; margin: 4px 0 0 0;">SMTP 测试邮件</p>
              </div>
              <div style="padding: 32px;">
                  <p style="font-size: 18px; font-weight: 600; margin-bottom: 16px;">测试成功！</p>
                  <p style="color: hsl(0, 0%, 45.1%); margin-bottom: 24px;">这是一封测试邮件，用于验证 SMTP 配置是否正确。</p>
                  <div style="background-color: hsl(0, 0%, 96.1%); border: 1px solid hsl(0, 0%, 89.8%); border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0;">
                      <div style="font-size: 32px; font-weight: 700; color: hsl(0, 0%, 9%); letter-spacing: 6px; margin-bottom: 8px; font-family: ui-monospace, monospace;">${code}</div>
                      <div style="color: hsl(0, 0%, 45.1%); font-size: 14px; font-weight: 500;">测试验证码</div>
                  </div>
                  <p style="color: hsl(0, 0%, 45.1%);">如果您收到此邮件，说明 SMTP 配置正确。</p>
              </div>
              <div style="background-color: hsl(0, 0%, 98%); padding: 24px 32px; text-align: center; border-top: 1px solid hsl(0, 0%, 89.8%); color: hsl(0, 0%, 45.1%); font-size: 14px;">
                  <p style="margin: 0;">此邮件由 FireflyCloud 系统自动发送，请勿回复。</p>
              </div>
          </div>
      </body>
      </html>
    `

    const mailOptions = {
      from: {
        name: 'FireflyCloud',
        address: config.user
      },
      to: email,
      subject: '【FireflyCloud】SMTP 测试邮件',
      html: template.replace(/\{\{CODE\}\}/g, code),
      text: `FireflyCloud SMTP 测试邮件。测试验证码：${code}`
    }

    const result = await transporter.sendMail(mailOptions)
    logger.email(email, 'SMTP 测试邮件', true)
    logger.info(`测试邮件发送成功: ${result.messageId}`)
    return true
  } catch (error) {
    logger.email(email, 'SMTP 测试邮件', false, error)
    logger.error('测试邮件发送失败:', error)
    logger.debug('错误详情:', {
      message: error.message,
      code: error.code,
      command: error.command
    })
    return false
  }
}

// 添加数据库管理路由到主路由
adminRoutes
  .get("/database/tables", async () => {
    try {
      // 获取所有表的数据统计
      const usersCount = await db.select().from(users).all()
      const filesCount = await db.select().from(files).all()
      const emailCodesCount = await db.select().from(emailVerificationCodes).all()
      const smtpConfigData = await db.select().from(smtpConfig).all()
      const storageConfigData = await db.select().from(storageConfig).all()

      return {
        tables: [
          {
            name: "users",
            displayName: "用户表",
            count: usersCount.length,
            description: "存储用户账户信息"
          },
          {
            name: "files",
            displayName: "文件表",
            count: filesCount.length,
            description: "存储文件元数据信息"
          },
          {
            name: "email_verification_codes",
            displayName: "邮箱验证码表",
            count: emailCodesCount.length,
            description: "存储邮箱验证码记录"
          },
          {
            name: "smtp_config",
            displayName: "SMTP配置表",
            count: smtpConfigData.length,
            description: "存储邮件服务器配置"
          },
          {
            name: "storage_config",
            displayName: "存储配置表",
            count: storageConfigData.length,
            description: "存储文件存储配置"
          }
        ]
      }
    } catch (error) {
      logger.error("Failed to get database tables:", error)
      return { error: "Failed to get database tables" }
    }
  })
  .get("/database/table/:tableName", async ({ params, set }) => {
    try {
      const { tableName } = params
      let data: any[] = []
      let columns: string[] = []

      switch (tableName) {
        case "users":
          data = await db.select().from(users).all()
          columns = ["id", "email", "role", "emailVerified", "createdAt", "updatedAt"]
          // 隐藏密码字段
          data = data.map(user => ({
            ...user,
            password: "***隐藏***"
          }))
          break
        case "files":
          data = await db.select().from(files).all()
          columns = ["id", "userId", "filename", "originalName", "size", "mimeType", "storageType", "storagePath", "createdAt"]
          break
        case "email_verification_codes":
          data = await db.select().from(emailVerificationCodes).all()
          columns = ["id", "email", "code", "expiresAt", "used", "createdAt"]
          break
        case "smtp_config":
          data = await db.select().from(smtpConfig).all()
          columns = ["id", "enabled", "host", "port", "user", "secure", "updatedAt"]
          // 隐藏密码字段
          data = data.map(config => ({
            ...config,
            pass: config.pass ? "***隐藏***" : ""
          }))
          break
        case "storage_config":
          data = await db.select().from(storageConfig).all()
          columns = ["id", "storageType", "r2Endpoint", "r2AccessKey", "r2Bucket", "updatedAt"]
          // 隐藏敏感字段
          data = data.map(config => ({
            ...config,
            r2SecretKey: config.r2SecretKey ? "***隐藏***" : ""
          }))
          break
        default:
          set.status = 404
          return { error: "Table not found" }
      }

      return {
        tableName,
        columns,
        data,
        count: data.length
      }
    } catch (error) {
      logger.error(`Failed to get table ${params.tableName}:`, error)
      set.status = 500
      return { error: "Failed to get table data" }
    }
  })

  // R2 挂载点管理 API
  // 获取所有用户的 R2 挂载点
  .get("/r2-mounts", async () => {
    try {
      logger.debug("管理员获取所有 R2 挂载点")

      const mounts = await db
        .select({
          id: r2MountPoints.id,
          userId: r2MountPoints.userId,
          folderId: r2MountPoints.folderId,
          r2Path: r2MountPoints.r2Path,
          mountName: r2MountPoints.mountName,
          enabled: r2MountPoints.enabled,
          createdAt: r2MountPoints.createdAt,
          updatedAt: r2MountPoints.updatedAt,
          userEmail: users.email,
          folderName: folders.name,
          folderPath: folders.path,
        })
        .from(r2MountPoints)
        .leftJoin(users, eq(r2MountPoints.userId, users.id))
        .leftJoin(folders, eq(r2MountPoints.folderId, folders.id))
        .orderBy(desc(r2MountPoints.createdAt))

      logger.info(`管理员查询到 ${mounts.length} 个 R2 挂载点`)
      return { mounts }
    } catch (error) {
      logger.error("管理员获取 R2 挂载点失败:", error)
      return { error: "Failed to get R2 mount points" }
    }
  })

  // 为指定用户创建 R2 挂载点
  .post("/r2-mounts", async ({ body, set }) => {
    try {
      const { userId, folderId, r2Path, mountName } = body

      logger.info(`管理员为用户 ${userId} 创建 R2 挂载点: ${mountName}`)

      // 检查用户是否存在
      const user = await db.select().from(users).where(eq(users.id, userId)).get()
      if (!user) {
        set.status = 404
        return { error: "User not found" }
      }

      // 检查文件夹是否存在且属于该用户
      const folder = await db
        .select()
        .from(folders)
        .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
        .get()

      if (!folder) {
        set.status = 404
        return { error: "Folder not found or does not belong to user" }
      }

      // 检查挂载点是否已存在
      const existingMount = await db
        .select()
        .from(r2MountPoints)
        .where(
          and(
            eq(r2MountPoints.userId, userId),
            eq(r2MountPoints.folderId, folderId)
          )
        )
        .get()

      if (existingMount) {
        set.status = 400
        return { error: "Mount point already exists for this folder" }
      }

      const mountId = nanoid()
      const now = Date.now()

      await db.insert(r2MountPoints).values({
        id: mountId,
        userId,
        folderId,
        r2Path,
        mountName,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      })

      logger.database('INSERT', 'r2_mount_points')
      logger.info(`管理员创建 R2 挂载点成功: ${mountName}`)

      return { message: "Mount point created successfully", mountId }
    } catch (error) {
      logger.error("管理员创建 R2 挂载点失败:", error)
      set.status = 500
      return { error: "Failed to create mount point" }
    }
  }, {
    body: t.Object({
      userId: t.String(),
      folderId: t.String(),
      r2Path: t.String(),
      mountName: t.String(),
    }),
  })

  // 更新 R2 挂载点
  .put("/r2-mounts/:id", async ({ params, body, set }) => {
    try {
      const { id } = params
      const { mountName, r2Path, enabled } = body

      logger.info(`管理员更新 R2 挂载点: ${id}`)

      const existingMount = await db
        .select()
        .from(r2MountPoints)
        .where(eq(r2MountPoints.id, id))
        .get()

      if (!existingMount) {
        set.status = 404
        return { error: "Mount point not found" }
      }

      await db
        .update(r2MountPoints)
        .set({
          mountName,
          r2Path,
          enabled,
          updatedAt: Date.now(),
        })
        .where(eq(r2MountPoints.id, id))

      logger.database('UPDATE', 'r2_mount_points')
      logger.info(`管理员更新 R2 挂载点成功: ${id}`)

      return { message: "Mount point updated successfully" }
    } catch (error) {
      logger.error("管理员更新 R2 挂载点失败:", error)
      set.status = 500
      return { error: "Failed to update mount point" }
    }
  }, {
    params: t.Object({
      id: t.String(),
    }),
    body: t.Object({
      mountName: t.String(),
      r2Path: t.String(),
      enabled: t.Boolean(),
    }),
  })

  // 删除 R2 挂载点
  .delete("/r2-mounts/:id", async ({ params, set }) => {
    try {
      const { id } = params

      logger.info(`管理员删除 R2 挂载点: ${id}`)

      const existingMount = await db
        .select()
        .from(r2MountPoints)
        .where(eq(r2MountPoints.id, id))
        .get()

      if (!existingMount) {
        set.status = 404
        return { error: "Mount point not found" }
      }

      await db.delete(r2MountPoints).where(eq(r2MountPoints.id, id))

      logger.database('DELETE', 'r2_mount_points')
      logger.info(`管理员删除 R2 挂载点成功: ${id}`)

      return { message: "Mount point deleted successfully" }
    } catch (error) {
      logger.error("管理员删除 R2 挂载点失败:", error)
      set.status = 500
      return { error: "Failed to delete mount point" }
    }
  }, {
    params: t.Object({
      id: t.String(),
    }),
  })

  // 获取所有用户的文件夹（用于创建挂载点时选择）
  .get("/users/:userId/folders", async ({ params, set }) => {
    try {
      const { userId } = params

      logger.debug(`管理员获取用户 ${userId} 的文件夹`)

      // 检查用户是否存在
      const user = await db.select().from(users).where(eq(users.id, userId)).get()
      if (!user) {
        set.status = 404
        return { error: "User not found" }
      }

      const userFolders = await db
        .select()
        .from(folders)
        .where(eq(folders.userId, userId))
        .orderBy(folders.path)

      logger.info(`用户 ${userId} 有 ${userFolders.length} 个文件夹`)
      return { folders: userFolders }
    } catch (error) {
      logger.error("管理员获取用户文件夹失败:", error)
      set.status = 500
      return { error: "Failed to get user folders" }
    }
  }, {
    params: t.Object({
      userId: t.String(),
    }),
  })

  // 刷新R2存储统计缓存
  .post("/refresh-r2-stats", async ({ set }) => {
    try {
      logger.info("管理员请求刷新R2存储统计")

      // 获取存储配置
      const config = await db.select().from(storageConfig).get()

      if (!config || (!config.enableMixedMode && config.storageType !== "r2") || !config.r2Endpoint) {
        set.status = 400
        return { error: "R2 storage not configured" }
      }

      const storageService = new StorageService(config)

      // 清除缓存
      storageService.clearR2StorageCache()

      // 强制重新查询
      const r2Stats = await storageService.calculateR2StorageUsage(false)

      if (r2Stats.error) {
        logger.warn(`R2存储统计刷新失败: ${r2Stats.error}`)
        set.status = 500
        return {
          error: r2Stats.error,
          stats: r2Stats
        }
      }

      logger.info(`R2存储统计刷新成功: ${r2Stats.totalFiles} 个文件，${r2Stats.totalSize} 字节`)

      return {
        message: "R2 storage stats refreshed successfully",
        stats: r2Stats
      }

    } catch (error) {
      logger.error("刷新R2存储统计失败:", error)
      set.status = 500
      return { error: "Failed to refresh R2 storage stats" }
    }
  })

  // 用户配额管理 API
  // 获取所有用户的配额信息
  .get("/user-quotas", async () => {
    try {
      logger.debug("管理员获取所有用户配额信息")

      const quotas = await db
        .select({
          id: userQuotas.id,
          userId: userQuotas.userId,
          maxStorage: userQuotas.maxStorage,
          usedStorage: userQuotas.usedStorage,
          role: userQuotas.role,
          customQuota: userQuotas.customQuota,
          createdAt: userQuotas.createdAt,
          updatedAt: userQuotas.updatedAt,
          userEmail: users.email,
        })
        .from(userQuotas)
        .leftJoin(users, eq(userQuotas.userId, users.id))
        .orderBy(desc(userQuotas.updatedAt))

      logger.info(`管理员查询到 ${quotas.length} 个用户配额记录`)
      return { quotas }
    } catch (error) {
      logger.error("管理员获取用户配额失败:", error)
      return { error: "Failed to get user quotas" }
    }
  })

  // 获取角色默认配额配置
  .get("/role-quota-config", async () => {
    try {
      logger.debug("管理员获取角色默认配额配置")

      const configs = await db
        .select()
        .from(roleQuotaConfig)
        .orderBy(roleQuotaConfig.role)

      logger.info(`查询到 ${configs.length} 个角色配额配置`)
      return { configs }
    } catch (error) {
      logger.error("获取角色配额配置失败:", error)
      return { error: "Failed to get role quota config" }
    }
  })

  // 更新角色默认配额
  .put("/role-quota-config/:role", async ({ params, body, set }) => {
    try {
      const { role } = params
      const { defaultQuota, description } = body

      logger.info(`管理员更新角色 ${role} 的默认配额: ${defaultQuota} 字节`)

      const existingConfig = await db
        .select()
        .from(roleQuotaConfig)
        .where(eq(roleQuotaConfig.role, role))
        .get()

      if (existingConfig) {
        await db
          .update(roleQuotaConfig)
          .set({
            defaultQuota,
            description,
            updatedAt: Date.now(),
          })
          .where(eq(roleQuotaConfig.role, role))
      } else {
        const configId = `quota_${role}_${Date.now()}`
        await db.insert(roleQuotaConfig).values({
          id: configId,
          role,
          defaultQuota,
          description,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      }

      logger.database(existingConfig ? 'UPDATE' : 'INSERT', 'role_quota_config')
      logger.info(`角色 ${role} 的默认配额更新成功`)

      return { message: "Role quota config updated successfully" }
    } catch (error) {
      logger.error("更新角色配额配置失败:", error)
      set.status = 500
      return { error: "Failed to update role quota config" }
    }
  }, {
    params: t.Object({
      role: t.String(),
    }),
    body: t.Object({
      defaultQuota: t.Number(),
      description: t.Optional(t.String()),
    }),
  })

  // 更新用户配额
  .put("/user-quotas/:userId", async ({ params, body, set }) => {
    try {
      const { userId } = params
      const { maxStorage, customQuota } = body

      logger.info(`管理员更新用户 ${userId} 的配额: ${maxStorage} 字节`)

      // 检查用户是否存在
      const user = await db.select().from(users).where(eq(users.id, userId)).get()
      if (!user) {
        set.status = 404
        return { error: "User not found" }
      }

      // 检查用户配额记录是否存在
      const existingQuota = await db
        .select()
        .from(userQuotas)
        .where(eq(userQuotas.userId, userId))
        .get()

      if (existingQuota) {
        await db
          .update(userQuotas)
          .set({
            maxStorage,
            customQuota,
            updatedAt: Date.now(),
          })
          .where(eq(userQuotas.userId, userId))
      } else {
        // 计算用户当前使用量（包括本地存储和R2存储）
        const userFiles = await db
          .select()
          .from(files)
          .where(eq(files.userId, userId))
          .all()

        // 分别计算本地存储和R2存储，然后求和
        let localStorage = 0
        let r2Storage = 0

        userFiles.forEach(file => {
          if (file.storageType === 'local') {
            localStorage += file.size
          } else if (file.storageType === 'r2') {
            r2Storage += file.size
          }
        })

        const totalUsedStorage = localStorage + r2Storage

        const quotaId = `quota_${userId}_${Date.now()}`
        await db.insert(userQuotas).values({
          id: quotaId,
          userId,
          maxStorage,
          usedStorage: totalUsedStorage,
          role: user.role,
          customQuota,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      }

      logger.database(existingQuota ? 'UPDATE' : 'INSERT', 'user_quotas')
      logger.info(`用户 ${userId} 的配额更新成功`)

      return { message: "User quota updated successfully" }
    } catch (error) {
      logger.error("更新用户配额失败:", error)
      set.status = 500
      return { error: "Failed to update user quota" }
    }
  }, {
    params: t.Object({
      userId: t.String(),
    }),
    body: t.Object({
      maxStorage: t.Number(),
      customQuota: t.Optional(t.Number()),
    }),
  })

  // 重新计算用户存储使用量
  .post("/recalculate-user-storage/:userId", async ({ params, set }) => {
    try {
      const { userId } = params

      logger.info(`管理员重新计算用户 ${userId} 的存储使用量`)

      // 检查用户是否存在
      const user = await db.select().from(users).where(eq(users.id, userId)).get()
      if (!user) {
        set.status = 404
        return { error: "User not found" }
      }

      // 使用QuotaService重新计算用户存储使用量
      const result = await QuotaService.recalculateUserStorage(userId)

      if (!result.success) {
        set.status = 404
        return { error: result.error || "User quota record not found" }
      }

      logger.info(`用户 ${userId} 存储使用量重新计算完成: ${result.oldUsed} -> ${result.newUsed} 字节`)

      return {
        message: "User storage recalculated successfully",
        oldUsedStorage: result.oldUsed,
        newUsedStorage: result.newUsed,
        fileCount: result.fileCount,
        localStorage: result.localStorage,
        r2Storage: result.r2Storage,
        localFiles: result.localFiles,
        r2Files: result.r2Files
      }

    } catch (error) {
      logger.error("重新计算用户存储使用量失败:", error)
      set.status = 500
      return { error: "Failed to recalculate user storage" }
    }
  }, {
    params: t.Object({
      userId: t.String(),
    }),
  })

  // 批量重新计算所有用户存储使用量
  .post("/recalculate-all-storage", async () => {
    try {
      logger.info("管理员批量重新计算所有用户存储使用量")

      const allUsers = await db.select().from(users).all()
      let updatedCount = 0

      for (const user of allUsers) {
        try {
          // 计算用户实际使用量（包括本地存储和R2存储）
          const userFiles = await db
            .select()
            .from(files)
            .where(eq(files.userId, user.id))
            .all()

          // 分别计算本地存储和R2存储，然后求和
          let localStorage = 0
          let r2Storage = 0

          userFiles.forEach(file => {
            if (file.storageType === 'local') {
              localStorage += file.size
            } else if (file.storageType === 'r2') {
              r2Storage += file.size
            }
          })

          const actualUsedStorage = localStorage + r2Storage

          // 更新配额记录
          const existingQuota = await db
            .select()
            .from(userQuotas)
            .where(eq(userQuotas.userId, user.id))
            .get()

          if (existingQuota) {
            await db
              .update(userQuotas)
              .set({
                usedStorage: actualUsedStorage,
                updatedAt: Date.now(),
              })
              .where(eq(userQuotas.userId, user.id))

            updatedCount++
            logger.debug(`用户 ${user.id} 存储使用量更新: ${actualUsedStorage} 字节 (本地: ${localStorage}, R2: ${r2Storage})`)
          }
        } catch (userError) {
          logger.error(`更新用户 ${user.id} 存储使用量失败:`, userError)
        }
      }

      logger.database('UPDATE', 'user_quotas')
      logger.info(`批量重新计算完成，更新了 ${updatedCount} 个用户的存储使用量`)

      return {
        message: "All user storage recalculated successfully",
        updatedCount,
        totalUsers: allUsers.length
      }

    } catch (error) {
      logger.error("批量重新计算存储使用量失败:", error)
      return { error: "Failed to recalculate all user storage" }
    }
  })

  // 修改管理员密码
  .put("/change-password", async ({ body, user, set }) => {
    try {
      const { currentPassword, newPassword } = body

      logger.info(`管理员 ${user.email} 请求修改密码`)

      // 获取当前管理员信息
      const admin = await db.select().from(users).where(eq(users.id, user.userId)).get()
      if (!admin) {
        set.status = 404
        return { error: "管理员账户不存在" }
      }

      // 验证当前密码
      const isCurrentPasswordValid = await verifyPassword(currentPassword, admin.password)
      if (!isCurrentPasswordValid) {
        set.status = 400
        return { error: "当前密码不正确" }
      }

      // 验证新密码强度
      const passwordValidation = validatePasswordStrength(newPassword)
      if (!passwordValidation.isValid) {
        set.status = 400
        return {
          error: "密码强度不足",
          details: passwordValidation.errors
        }
      }

      // 检查新密码是否与当前密码相同
      const isSamePassword = await verifyPassword(newPassword, admin.password)
      if (isSamePassword) {
        set.status = 400
        return { error: "新密码不能与当前密码相同" }
      }

      // 哈希新密码
      const hashedNewPassword = await hashPassword(newPassword)

      // 更新密码
      await db
        .update(users)
        .set({
          password: hashedNewPassword,
          updatedAt: Date.now(),
        })
        .where(eq(users.id, user.userId))

      logger.database('UPDATE', 'users')
      logger.info(`管理员 ${user.email} 密码修改成功`)

      return {
        message: "密码修改成功",
        passwordStrength: passwordValidation.strength
      }
    } catch (error) {
      logger.error("管理员密码修改失败:", error)
      set.status = 500
      return { error: "密码修改失败" }
    }
  }, {
    body: t.Object({
      currentPassword: t.String({ minLength: 1 }),
      newPassword: t.String({ minLength: 6, maxLength: 128 }),
    }),
  })
