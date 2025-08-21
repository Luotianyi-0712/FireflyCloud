import { Elysia, t } from "elysia"
import { jwt } from "@elysiajs/jwt"
import { bearer } from "@elysiajs/bearer"
import { db } from "../db"
import { googleOAuthConfig } from "../db/schema"
import { eq } from "drizzle-orm"
import { logger } from "../utils/logger"
import { GoogleOAuthService } from "../services/google-oauth"

// 管理员权限验证中间件
const requireAdmin = async (bearer: string | undefined, jwt: any) => {
  if (!bearer) {
    throw new Error("未提供认证令牌")
  }

  const payload = await jwt.verify(bearer)
  if (!payload) {
    throw new Error("认证令牌无效")
  }

  if (payload.role !== "admin") {
    throw new Error("需要管理员权限")
  }

  return payload
}

export const adminGoogleOAuthRoutes = new Elysia({ prefix: "/admin" })
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET || "your-secret-key",
    }),
  )
  .use(bearer())
  .get("/google-oauth-config", async ({ jwt, bearer, set }) => {
    try {
      await requireAdmin(bearer, jwt)

      const config = await db.select().from(googleOAuthConfig).get()
      
      return {
        config: config ? {
          enabled: config.enabled,
          clientId: config.clientId || "",
          clientSecret: config.clientSecret || "",
          redirectUri: config.redirectUri || ""
        } : {
          enabled: false,
          clientId: "",
          clientSecret: "",
          redirectUri: ""
        }
      }
    } catch (error) {
      logger.error("获取谷歌OAuth配置失败:", error)
      set.status = error.message === "需要管理员权限" ? 403 : 401
      return { error: error.message }
    }
  })
  .post("/google-oauth-config", async ({ body, jwt, bearer, set }) => {
    try {
      await requireAdmin(bearer, jwt)

      const { enabled, clientId, clientSecret, redirectUri } = body

      // 验证必填字段
      if (enabled && (!clientId || !clientSecret || !redirectUri)) {
        set.status = 400
        return { error: "启用谷歌OAuth时，所有配置项都是必填的" }
      }

      const now = Date.now()

      // 检查是否已存在配置
      const existingConfig = await db.select().from(googleOAuthConfig).get()

      if (existingConfig) {
        // 更新现有配置
        await db.update(googleOAuthConfig)
          .set({
            enabled,
            clientId: enabled ? clientId : null,
            clientSecret: enabled ? clientSecret : null,
            redirectUri: enabled ? redirectUri : null,
            updatedAt: now
          })
          .where(eq(googleOAuthConfig.id, 1))
      } else {
        // 创建新配置
        await db.insert(googleOAuthConfig).values({
          id: 1,
          enabled,
          clientId: enabled ? clientId : null,
          clientSecret: enabled ? clientSecret : null,
          redirectUri: enabled ? redirectUri : null,
          updatedAt: now
        })
      }

      logger.info(`谷歌OAuth配置已更新: enabled=${enabled}`)
      return { success: true, message: "配置已保存" }
    } catch (error) {
      logger.error("保存谷歌OAuth配置失败:", error)
      set.status = error.message === "需要管理员权限" ? 403 : 500
      return { error: error.message }
    }
  }, {
    body: t.Object({
      enabled: t.Boolean(),
      clientId: t.String(),
      clientSecret: t.String(),
      redirectUri: t.String()
    })
  })
  .post("/test-google-oauth", async ({ body, jwt, bearer, set }) => {
    try {
      await requireAdmin(bearer, jwt)

      const { clientId, clientSecret, redirectUri } = body

      if (!clientId || !clientSecret || !redirectUri) {
        set.status = 400
        return { error: "所有配置项都是必填的" }
      }

      // 创建谷歌OAuth服务实例进行测试
      const googleOAuth = new GoogleOAuthService({
        clientId,
        clientSecret,
        redirectUri
      })

      // 生成授权URL来测试配置是否有效
      try {
        const authUrl = googleOAuth.getAuthUrl("test")
        
        // 如果能成功生成URL，说明配置基本有效
        if (authUrl && authUrl.includes('accounts.google.com')) {
          return { 
            success: true, 
            message: "谷歌OAuth配置测试成功",
            authUrl: authUrl.substring(0, 100) + "..." // 只返回URL的前100个字符用于验证
          }
        } else {
          return { success: false, error: "生成的授权URL无效" }
        }
      } catch (error) {
        return { 
          success: false, 
          error: `配置测试失败: ${error.message}` 
        }
      }
    } catch (error) {
      logger.error("测试谷歌OAuth配置失败:", error)
      set.status = error.message === "需要管理员权限" ? 403 : 500
      return { error: error.message }
    }
  }, {
    body: t.Object({
      clientId: t.String(),
      clientSecret: t.String(),
      redirectUri: t.String()
    })
  })