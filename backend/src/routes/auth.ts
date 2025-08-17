import { Elysia, t } from "elysia"
import { jwt } from "@elysiajs/jwt"
import { bearer } from "@elysiajs/bearer"
import bcrypt from "bcryptjs"
import { nanoid } from "nanoid"
import { db } from "../db"
import { users, emailVerificationCodes, smtpConfig } from "../db/schema"
import { eq, and, gt } from "drizzle-orm"
import { sendVerificationEmail, generateVerificationCode } from "../services/email"
import { QuotaService } from "../services/quota"
import { logger } from "../utils/logger"

// 检查 SMTP 是否启用的辅助函数
async function isSmtpEnabled(): Promise<boolean> {
  try {
    const config = await db.select().from(smtpConfig).get()

    if (config) {
      // 如果数据库中有配置，使用数据库配置
      logger.debug(`SMTP 状态检查: 使用数据库配置, enabled=${config.enabled}`)
      return config.enabled
    }

    // 如果数据库中没有配置，检查环境变量
    const hasEnvConfig = !!(process.env.SMTP_HOST && process.env.SMTP_PORT &&
                           process.env.SMTP_USER && process.env.SMTP_PASS)
    logger.debug(`SMTP 状态检查: 使用环境变量配置, enabled=${hasEnvConfig}`)
    return hasEnvConfig
  } catch (error) {
    logger.error("Failed to check SMTP status:", error)
    return false
  }
}

export const authRoutes = new Elysia({ prefix: "/auth" })
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET || "your-secret-key",
    }),
  )
  .use(bearer())
  .get("/smtp-status", async () => {
    const enabled = await isSmtpEnabled()
    return { enabled }
  })
  .post(
    "/send-verification-code",
    async ({ body, set }) => {
      try {
        const { email } = body

        // 检查是否启用了 SMTP
        const smtpEnabled = await isSmtpEnabled()

        if (!smtpEnabled) {
          set.status = 400
          return { error: "邮件服务未启用，无法发送验证码" }
        }

        // 检查用户是否已存在
        const existingUser = await db.select().from(users).where(eq(users.email, email)).get()
        if (existingUser) {
          set.status = 400
          return { error: "邮箱已被注册" }
        }

        // 生成验证码
        const code = generateVerificationCode()
        const expiresAt = Date.now() + 10 * 60 * 1000 // 10分钟后过期
        const codeId = nanoid()

        // 删除该邮箱之前未使用的验证码
        await db.delete(emailVerificationCodes)
          .where(and(
            eq(emailVerificationCodes.email, email),
            eq(emailVerificationCodes.used, false)
          ))

        // 保存验证码
        await db.insert(emailVerificationCodes).values({
          id: codeId,
          email,
          code,
          expiresAt,
          used: false,
          createdAt: Date.now(),
        })

        // 发送邮件
        const emailSent = await sendVerificationEmail(email, code)
        if (!emailSent) {
          set.status = 500
          return { error: "邮件发送失败，请稍后重试" }
        }

        return {
          success: true,
          message: "验证码已发送到您的邮箱，请查收",
          expiresIn: 600 // 10分钟
        }
      } catch (error) {
        logger.error("发送验证码失败:", error)
        set.status = 500
        return { error: "发送验证码失败" }
      }
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
      }),
    },
  )
  .post(
    "/register",
    async ({ body, jwt, set }) => {
      try {
        const { email, password, verificationCode } = body

        // 检查用户是否已存在
        const existingUser = await db.select().from(users).where(eq(users.email, email)).get()
        if (existingUser) {
          set.status = 400
          return { error: "邮箱已被注册" }
        }

        // 检查是否启用了 SMTP
        const smtpEnabled = await isSmtpEnabled()

        let emailVerified = false

        // 如果启用了 SMTP，则需要验证邮箱验证码
        if (smtpEnabled) {
          if (!verificationCode) {
            set.status = 400
            return { error: "请输入邮箱验证码" }
          }

          // 验证邮箱验证码
          const now = Date.now()
          const validCode = await db.select()
            .from(emailVerificationCodes)
            .where(and(
              eq(emailVerificationCodes.email, email),
              eq(emailVerificationCodes.code, verificationCode),
              eq(emailVerificationCodes.used, false),
              gt(emailVerificationCodes.expiresAt, now)
            ))
            .get()

          if (!validCode) {
            set.status = 400
            return { error: "验证码无效或已过期" }
          }

          // 标记验证码为已使用
          await db.update(emailVerificationCodes)
            .set({ used: true })
            .where(eq(emailVerificationCodes.id, validCode.id))

          emailVerified = true
        } else {
          // 如果未启用 SMTP，直接设置为已验证
          emailVerified = true
        }

        // 加密密码
        const hashedPassword = await bcrypt.hash(password, 10)

        // 创建用户
        const userId = nanoid()
        const now = Date.now()

        await db.insert(users).values({
          id: userId,
          email,
          password: hashedPassword,
          role: "user",
          emailVerified,
          createdAt: now,
          updatedAt: now,
        })

        // 生成token
        const token = await jwt.sign({
          userId,
          email,
          role: "user",
        })

        return {
          token,
          user: {
            id: userId,
            email,
            role: "user",
            emailVerified,
          },
        }
      } catch (error) {
        logger.error("注册失败:", error)
        set.status = 500
        return { error: "注册失败" }
      }
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        password: t.String({ minLength: 6 }),
        verificationCode: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/login",
    async ({ body, jwt, set }) => {
      try {
        const { email, password } = body

        // Find user
        const user = await db.select().from(users).where(eq(users.email, email)).get()
        if (!user) {
          logger.warn(`登录失败: 用户不存在 - ${email}`)
          set.status = 401
          return { error: "用户名或密码不正确" }
        }

        // Verify password
        const isValid = await bcrypt.compare(password, user.password)
        if (!isValid) {
          logger.warn(`登录失败: 密码错误 - ${email}`)
          set.status = 401
          return { error: "用户名或密码不正确" }
        }

        // Generate token
        const token = await jwt.sign({
          userId: user.id,
          email: user.email,
          role: user.role,
        })

        return {
          token,
          user: {
            id: user.id,
            email: user.email,
            role: user.role,
          },
        }
      } catch (error) {
        logger.error("登录失败:", error)
        set.status = 500
        return { error: "登录失败，请稍后重试" }
      }
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        password: t.String(),
      }),
    },
  )
  .get("/me", async ({ jwt, bearer, set }) => {
    try {
      if (!bearer) {
        set.status = 401
        return { error: "未提供认证令牌" }
      }

      const payload = await jwt.verify(bearer)
      if (!payload) {
        set.status = 401
        return { error: "认证令牌无效" }
      }

      const user = await db.select().from(users).where(eq(users.id, payload.userId)).get()
      if (!user) {
        set.status = 404
        return { error: "用户不存在" }
      }

      return {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
      }
    } catch (error) {
      logger.error("用户认证失败:", error)
      set.status = 401
      return { error: "认证失败" }
    }
  })
  .get("/quota", async ({ jwt, bearer, set }) => {
    try {
      if (!bearer) {
        set.status = 401
        return { error: "未提供认证令牌" }
      }

      const payload = await jwt.verify(bearer)
      if (!payload) {
        set.status = 401
        return { error: "认证令牌无效" }
      }

      // 获取用户配额信息
      const quota = await QuotaService.getUserQuota(payload.userId)
      if (!quota) {
        // 如果没有配额记录，尝试创建一个
        const user = await db.select().from(users).where(eq(users.id, payload.userId)).get()
        if (user) {
          await QuotaService.createUserQuota(payload.userId, user.role)
          const newQuota = await QuotaService.getUserQuota(payload.userId)
          if (newQuota) {
            return {
              quota: {
                maxStorage: newQuota.maxStorage,
                usedStorage: newQuota.usedStorage,
                availableSpace: newQuota.availableSpace,
                usagePercentage: QuotaService.getUsagePercentage(newQuota.usedStorage, newQuota.maxStorage),
                maxStorageFormatted: QuotaService.formatFileSize(newQuota.maxStorage),
                usedStorageFormatted: QuotaService.formatFileSize(newQuota.usedStorage),
                availableSpaceFormatted: QuotaService.formatFileSize(newQuota.availableSpace),
              }
            }
          }
        }

        set.status = 404
        return { error: "配额信息未找到" }
      }

      return {
        quota: {
          maxStorage: quota.maxStorage,
          usedStorage: quota.usedStorage,
          availableSpace: quota.availableSpace,
          usagePercentage: QuotaService.getUsagePercentage(quota.usedStorage, quota.maxStorage),
          maxStorageFormatted: QuotaService.formatFileSize(quota.maxStorage),
          usedStorageFormatted: QuotaService.formatFileSize(quota.usedStorage),
          availableSpaceFormatted: QuotaService.formatFileSize(quota.availableSpace),
        }
      }
    } catch (error) {
      logger.error("获取用户配额失败:", error)
      set.status = 500
      return { error: "获取配额信息失败" }
    }
  })
  .get("/quota-debug", async ({ jwt, bearer, set }) => {
    try {
      if (!bearer) {
        set.status = 401
        return { error: "未提供认证令牌" }
      }

      const payload = await jwt.verify(bearer)
      if (!payload) {
        set.status = 401
        return { error: "认证令牌无效" }
      }

      logger.info(`调试配额信息: 用户 ${payload.userId}`)

      // 获取用户所有文件
      const userFiles = await db
        .select()
        .from(files)
        .where(eq(files.userId, payload.userId))
        .all()

      // 计算本地存储使用量（数据库中storageType='local'的文件）
      let localStorage = 0
      let localCount = 0

      const fileDetails = userFiles.map(file => {
        if (file.storageType === 'local') {
          localStorage += file.size
          localCount++
        }

        return {
          id: file.id,
          name: file.originalName,
          size: file.size,
          storageType: file.storageType,
          createdAt: file.createdAt
        }
      })

      // 获取R2实际存储使用量
      let r2ActualStorage = 0
      let r2ActualFiles = 0
      let r2StorageError: string | undefined

      const config = await db.select().from(storageConfig).get()
      if (config && (config.storageType === "r2" || config.enableMixedMode) && config.r2Endpoint) {
        try {
          const { StorageService } = await import("../services/storage")
          const storageService = new StorageService(config)
          const r2Stats = await storageService.calculateR2StorageUsage()

          if (!r2Stats.error) {
            r2ActualStorage = r2Stats.totalSize
            r2ActualFiles = r2Stats.totalFiles
          } else {
            r2StorageError = r2Stats.error
          }
        } catch (error) {
          r2StorageError = error instanceof Error ? error.message : "Unknown error"
        }
      }

      const totalUsed = localStorage + r2ActualStorage

      // 获取数据库中的配额记录
      const quota = await db
        .select()
        .from(userQuotas)
        .where(eq(userQuotas.userId, payload.userId))
        .get()

      return {
        userId: payload.userId,
        fileCount: userFiles.length,
        files: fileDetails,
        calculatedUsage: {
          localStorage,
          r2ActualStorage,
          totalUsed,
          localCount,
          r2ActualFiles,
          r2StorageError
        },
        databaseQuota: quota ? {
          usedStorage: quota.usedStorage,
          maxStorage: quota.maxStorage,
          customQuota: quota.customQuota
        } : null,
        isConsistent: quota ? (totalUsed === quota.usedStorage) : false
      }
    } catch (error) {
      logger.error("获取配额调试信息失败:", error)
      set.status = 500
      return { error: "获取配额调试信息失败" }
    }
  })
