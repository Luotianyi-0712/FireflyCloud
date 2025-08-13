import { Elysia, t } from "elysia"
import { jwt } from "@elysiajs/jwt"
import { bearer } from "@elysiajs/bearer"
import { db } from "../db"
import { users, files, smtpConfig } from "../db/schema"
import { eq } from "drizzle-orm"
import { sendVerificationEmail } from "../services/email"

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
    const totalUsers = await db.select().from(users).all()
    const totalFiles = await db.select().from(files).all()

    const totalStorage = totalFiles.reduce((sum, file) => sum + file.size, 0)

    return {
      totalUsers: totalUsers.length,
      totalFiles: totalFiles.length,
      totalStorage,
      adminUsers: totalUsers.filter((u) => u.role === "admin").length,
      regularUsers: totalUsers.filter((u) => u.role === "user").length,
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
      console.error("Failed to get SMTP config:", error)
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

        return { message: "SMTP configuration updated successfully" }
      } catch (error) {
        console.error("Failed to update SMTP config:", error)
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

        console.log('收到测试邮件请求:', { email, config: { ...config, pass: '***' } })

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
        console.error("Failed to send test email:", error)
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
    console.log('开始发送测试邮件到:', email)
    console.log('SMTP 配置:', {
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
    console.log('SMTP 连接验证成功')

    const template = config.emailTemplate || `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2>FireflyCloud 测试邮件</h2>
        <p>这是一封测试邮件，用于验证 SMTP 配置是否正确。</p>
        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
          <div style="font-size: 24px; font-weight: bold; color: #3b82f6;">${code}</div>
          <div style="color: #666; margin-top: 8px;">测试验证码</div>
        </div>
        <p>如果您收到此邮件，说明 SMTP 配置正确。</p>
      </div>
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
    console.log('测试邮件发送成功:', result.messageId)
    return true
  } catch (error) {
    console.error('测试邮件发送失败:', error)
    console.error('错误详情:', {
      message: error.message,
      code: error.code,
      command: error.command
    })
    return false
  }
}
