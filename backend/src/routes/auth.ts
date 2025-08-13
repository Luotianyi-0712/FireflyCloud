import { Elysia, t } from "elysia"
import { jwt } from "@elysiajs/jwt"
import { bearer } from "@elysiajs/bearer"
import bcrypt from "bcryptjs"
import { nanoid } from "nanoid"
import { db } from "../db"
import { users, emailVerificationCodes, smtpConfig } from "../db/schema"
import { eq, and, gt } from "drizzle-orm"
import { sendVerificationEmail, generateVerificationCode } from "../services/email"
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
          set.status = 401
          return { error: "Invalid credentials" }
        }

        // Verify password
        const isValid = await bcrypt.compare(password, user.password)
        if (!isValid) {
          set.status = 401
          return { error: "Invalid credentials" }
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
        set.status = 500
        return { error: "Login failed" }
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
        return { error: "No token provided" }
      }

      const payload = await jwt.verify(bearer)
      if (!payload) {
        set.status = 401
        return { error: "Invalid token" }
      }

      const user = await db.select().from(users).where(eq(users.id, payload.userId)).get()
      if (!user) {
        set.status = 404
        return { error: "User not found" }
      }

      return {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
      }
    } catch (error) {
      set.status = 401
      return { error: "Authentication failed" }
    }
  })
