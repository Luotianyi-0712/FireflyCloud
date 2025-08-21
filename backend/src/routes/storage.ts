import { Elysia, t } from "elysia"
import { jwt } from "@elysiajs/jwt"
import { bearer } from "@elysiajs/bearer"
import { db } from "../db"
import { storageConfig, r2MountPoints, oneDriveMountPoints, webdavMountPoints, oneDriveAuth, folders, storageStrategies } from "../db/schema"
import { StorageService } from "../services/storage"
import { logger } from "../utils/logger"
import { nanoid } from "nanoid"
import { eq, and } from "drizzle-orm"
import { OneDriveService } from "../services/onedrive"

export const storageRoutes = new Elysia({ prefix: "/storage" })
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET || "your-secret-key",
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
  .get("/config", async () => {
    logger.debug("获取存储配置")
    const config = await db.select().from(storageConfig).get()
    logger.info(`存储配置查询完成: ${config?.storageType || "local"}`)
    return {
      config: {
        storageType: config?.storageType || "local",
        r2Endpoint: config?.r2Endpoint || "",
        r2Bucket: config?.r2Bucket || "",
        // 返回已保存的访问密钥，便于前端自动填充
        r2AccessKey: (config as any)?.r2AccessKey || "",
        r2SecretKey: (config as any)?.r2SecretKey || "",
        oneDriveClientId: config?.oneDriveClientId || "",
        oneDriveTenantId: config?.oneDriveTenantId || "",
        // WebDAV 相关
        oneDriveWebDavUrl: (config as any)?.oneDriveWebDavUrl || "",
        oneDriveWebDavUser: (config as any)?.oneDriveWebDavUser || "",
        oneDriveWebDavPass: (config as any)?.oneDriveWebDavPass || "",
        enableMixedMode: config?.enableMixedMode || false,
      },
    }
  })
  .put(
    "/config",
    async ({ body, set }) => {
      try {
        const {
          storageType,
          r2Endpoint,
          r2AccessKey,
          r2SecretKey,
          r2Bucket,
          oneDriveClientId,
          oneDriveClientSecret,
          oneDriveTenantId,
          // 新增 WebDAV 字段
          oneDriveWebDavUrl,
          oneDriveWebDavUser,
          oneDriveWebDavPass,
          enableMixedMode
        } = body

        logger.info(`更新存储配置: ${storageType}, 混合模式: ${enableMixedMode}`)
        logger.debug("存储配置详情:", { storageType, r2Endpoint, r2Bucket, oneDriveClientId, oneDriveTenantId, enableMixedMode, oneDriveWebDavUrl })

        const existingConfig = await db.select().from(storageConfig).get()

        if (existingConfig) {
          await db
            .update(storageConfig)
            .set({
              storageType,
              r2Endpoint,
              r2AccessKey,
              r2SecretKey,
              r2Bucket,
              oneDriveClientId,
              oneDriveClientSecret,
              oneDriveTenantId,
              // WebDAV 字段
              oneDriveWebDavUrl,
              oneDriveWebDavUser,
              oneDriveWebDavPass,
              enableMixedMode: enableMixedMode || false,
              updatedAt: Date.now(),
            } as any)
            .where(eq(storageConfig.id, 1))
          logger.database('UPDATE', 'storage_config')
        } else {
          await db.insert(storageConfig).values({
            id: 1,
            storageType,
            r2Endpoint,
            r2AccessKey,
            r2SecretKey,
            r2Bucket,
            oneDriveClientId,
            oneDriveClientSecret,
            oneDriveTenantId,
            // WebDAV 字段
            oneDriveWebDavUrl,
            oneDriveWebDavUser,
            oneDriveWebDavPass,
            enableMixedMode: enableMixedMode || false,
            updatedAt: Date.now(),
          } as any)
          logger.database('INSERT', 'storage_config')
        }

        logger.info(`存储配置更新成功: ${storageType}`)
        return { message: "Storage config updated successfully" }
      } catch (error) {
        logger.error("存储配置更新失败:", error)
        set.status = 500
        return { error: "Config update failed" }
      }
    },
    {
      body: t.Object({
        storageType: t.Union([t.Literal("local"), t.Literal("r2"), t.Literal("onedrive"), t.Literal("webdav")]),
        r2Endpoint: t.Optional(t.String()),
        r2AccessKey: t.Optional(t.String()),
        r2SecretKey: t.Optional(t.String()),
        r2Bucket: t.Optional(t.String()),
        oneDriveClientId: t.Optional(t.String()),
        oneDriveClientSecret: t.Optional(t.String()),
        oneDriveTenantId: t.Optional(t.String()),
        // WebDAV 提交字段
        oneDriveWebDavUrl: t.Optional(t.String()),
        oneDriveWebDavUser: t.Optional(t.String()),
        oneDriveWebDavPass: t.Optional(t.String()),
        enableMixedMode: t.Optional(t.Boolean()),
      }),
    },
  )

  // ===== 存储策略管理 API =====
  
  // 获取所有存储策略
  .get("/strategies", async ({ user }) => {
    try {
      logger.debug(`获取用户存储策略: ${user.userId}`)
      
      // 从数据库获取存储策略
      const strategies = await db.select().from(storageStrategies).all()
      
      // 隐藏敏感配置信息
      const safeStrategies = strategies.map(strategy => ({
        ...strategy,
        config: JSON.parse(strategy.config),
        createdAt: new Date(strategy.createdAt).toISOString(),
        updatedAt: new Date(strategy.updatedAt).toISOString()
      })).map(strategy => ({
        ...strategy,
        config: {
          ...strategy.config,
          r2SecretKey: strategy.config.r2SecretKey ? "***" : undefined,
          webDavPass: strategy.config.webDavPass ? "***" : undefined,
          oneDriveClientSecret: strategy.config.oneDriveClientSecret ? "***" : undefined,
        }
      }))
      
      logger.info(`返回 ${safeStrategies.length} 个存储策略`)
      return { strategies: safeStrategies }
    } catch (error) {
      logger.error("获取存储策略失败:", error)
      return { strategies: [] }
    }
  })

  // 创建存储策略
  .post("/strategies", async ({ body, user, set }) => {
    try {
      const { name, type, config, clientSecret } = body

      logger.info(`创建存储策略: ${name} (${type})`)

      // 验证策略名称唯一性
      const existingStrategy = await db
        .select()
        .from(storageStrategies)
        .where(eq(storageStrategies.name, name))
        .get()

      if (existingStrategy) {
        set.status = 400
        return { error: "策略名称已存在" }
      }

      // 验证配置
      if (type === "r2") {
        if (!config.r2Endpoint || !config.r2Bucket || !config.r2AccessKey || !config.r2SecretKey) {
          set.status = 400
          return { error: "R2 配置信息不完整" }
        }
      } else if (type === "onedrive") {
        if (!config.oneDriveClientId || !config.oneDriveTenantId || !clientSecret) {
          set.status = 400
          return { error: "OneDrive 配置信息不完整" }
        }
      } else if (type === "webdav") {
        if (!config.webDavUrl || !config.webDavUser || !config.webDavPass) {
          set.status = 400
          return { error: "WebDAV 配置信息不完整" }
        }
      }

      const strategyId = nanoid()
      const now = Date.now()

      const strategyConfig = {
        ...config,
        ...(type === "onedrive" && clientSecret && { oneDriveClientSecret: clientSecret })
      }

      await db.insert(storageStrategies).values({
        id: strategyId,
        name,
        type,
        config: JSON.stringify(strategyConfig),
        isActive: false,
        createdAt: now,
        updatedAt: now,
      })

      logger.database('INSERT', 'storage_strategies')
      logger.info(`存储策略创建成功: ${name}`)
      return { message: "存储策略创建成功", strategyId }
    } catch (error) {
      logger.error("创建存储策略失败:", error)
      set.status = 500
      return { error: "创建存储策略失败" }
    }
  }, {
    body: t.Object({
      name: t.String(),
      type: t.Union([t.Literal("local"), t.Literal("r2"), t.Literal("onedrive"), t.Literal("webdav")]),
      config: t.Object({
        r2Endpoint: t.Optional(t.String()),
        r2Bucket: t.Optional(t.String()),
        r2AccessKey: t.Optional(t.String()),
        r2SecretKey: t.Optional(t.String()),
        oneDriveClientId: t.Optional(t.String()),
        oneDriveTenantId: t.Optional(t.String()),
        webDavUrl: t.Optional(t.String()),
        webDavUser: t.Optional(t.String()),
        webDavPass: t.Optional(t.String()),
      }),
      clientSecret: t.Optional(t.String()),
    }),
  })

  // 更新存储策略
  .put("/strategies/:id", async ({ params, body, user, set }) => {
    try {
      const { id } = params
      const { name, type, config, clientSecret } = body

      logger.info(`更新存储策略: ${id}`)

      const existingStrategy = await db
        .select()
        .from(storageStrategies)
        .where(eq(storageStrategies.id, id))
        .get()

      if (!existingStrategy) {
        set.status = 404
        return { error: "存储策略不存在" }
      }

      // 验证策略名称唯一性（排除当前策略）
      const duplicateStrategy = await db
        .select()
        .from(storageStrategies)
        .where(and(eq(storageStrategies.name, name), eq(storageStrategies.id, id)))
        .get()

      if (duplicateStrategy && duplicateStrategy.id !== id) {
        set.status = 400
        return { error: "策略名称已存在" }
      }

      // 验证配置
      if (type === "r2") {
        if (!config.r2Endpoint || !config.r2Bucket || !config.r2AccessKey || !config.r2SecretKey) {
          set.status = 400
          return { error: "R2 配置信息不完整" }
        }
      } else if (type === "onedrive") {
        if (!config.oneDriveClientId || !config.oneDriveTenantId || !clientSecret) {
          set.status = 400
          return { error: "OneDrive 配置信息不完整" }
        }
      } else if (type === "webdav") {
        if (!config.webDavUrl || !config.webDavUser || !config.webDavPass) {
          set.status = 400
          return { error: "WebDAV 配置信息不完整" }
        }
      }

      const strategyConfig = {
        ...config,
        ...(type === "onedrive" && clientSecret && { oneDriveClientSecret: clientSecret })
      }

      await db
        .update(storageStrategies)
        .set({
          name,
          type,
          config: JSON.stringify(strategyConfig),
          updatedAt: Date.now(),
        })
        .where(eq(storageStrategies.id, id))

      logger.database('UPDATE', 'storage_strategies')
      logger.info(`存储策略更新成功: ${id}`)
      return { message: "存储策略更新成功" }
    } catch (error) {
      logger.error("更新存储策略失败:", error)
      set.status = 500
      return { error: "更新存储策略失败" }
    }
  }, {
    body: t.Object({
      name: t.String(),
      type: t.Union([t.Literal("local"), t.Literal("r2"), t.Literal("onedrive"), t.Literal("webdav")]),
      config: t.Object({
        r2Endpoint: t.Optional(t.String()),
        r2Bucket: t.Optional(t.String()),
        r2AccessKey: t.Optional(t.String()),
        r2SecretKey: t.Optional(t.String()),
        oneDriveClientId: t.Optional(t.String()),
        oneDriveTenantId: t.Optional(t.String()),
        webDavUrl: t.Optional(t.String()),
        webDavUser: t.Optional(t.String()),
        webDavPass: t.Optional(t.String()),
      }),
      clientSecret: t.Optional(t.String()),
    }),
  })

  // 删除存储策略
  .delete("/strategies/:id", async ({ params, user, set }) => {
    try {
      const { id } = params

      logger.info(`删除存储策略: ${id}`)

      const strategy = await db
        .select()
        .from(storageStrategies)
        .where(eq(storageStrategies.id, id))
        .get()

      if (!strategy) {
        set.status = 404
        return { error: "存储策略不存在" }
      }

      // 不允许删除激活的策略
      if (strategy.isActive) {
        set.status = 400
        return { error: "无法删除激活的存储策略，请先切换到其他策略" }
      }

      await db
        .delete(storageStrategies)
        .where(eq(storageStrategies.id, id))

      logger.database('DELETE', 'storage_strategies')
      logger.info(`存储策略删除成功: ${id}`)
      return { message: "存储策略删除成功" }
    } catch (error) {
      logger.error("删除存储策略失败:", error)
      set.status = 500
      return { error: "删除存储策略失败" }
    }
  })

  // 切换存储策略状态
  .put("/strategies/:id/toggle", async ({ params, body, user, set }) => {
    try {
      const { id } = params
      const { isActive } = body

      logger.info(`切换存储策略状态: ${id} -> ${isActive}`)

      const strategy = await db
        .select()
        .from(storageStrategies)
        .where(eq(storageStrategies.id, id))
        .get()

      if (!strategy) {
        set.status = 404
        return { error: "存储策略不存在" }
      }

      if (isActive) {
        // 激活策略时，先禁用其他所有策略
        await db
          .update(storageStrategies)
          .set({ isActive: false })
          .where(eq(storageStrategies.isActive, true))
      }

      // 更新目标策略状态
      await db
        .update(storageStrategies)
        .set({
          isActive,
          updatedAt: Date.now(),
        })
        .where(eq(storageStrategies.id, id))

      // 如果激活了新策略，同步更新到存储配置
      if (isActive) {
        try {
          const activeStrategy = JSON.parse(strategy.config)
          const existingConfig = await db.select().from(storageConfig).get()
          
          const configData = {
            storageType: strategy.type,
            r2Endpoint: activeStrategy.r2Endpoint || "",
            r2AccessKey: activeStrategy.r2AccessKey || "",
            r2SecretKey: activeStrategy.r2SecretKey || "",
            r2Bucket: activeStrategy.r2Bucket || "",
            oneDriveClientId: activeStrategy.oneDriveClientId || "",
            oneDriveClientSecret: activeStrategy.oneDriveClientSecret || "",
            oneDriveTenantId: activeStrategy.oneDriveTenantId || "",
            oneDriveWebDavUrl: activeStrategy.webDavUrl || "",
            oneDriveWebDavUser: activeStrategy.webDavUser || "",
            oneDriveWebDavPass: activeStrategy.webDavPass || "",
            enableMixedMode: false,
            updatedAt: Date.now(),
          }

          if (existingConfig) {
            await db
              .update(storageConfig)
              .set(configData as any)
              .where(eq(storageConfig.id, 1))
          } else {
            await db.insert(storageConfig).values({
              id: 1,
              ...configData,
            } as any)
          }

          logger.info(`存储配置已同步: ${strategy.type}`)
        } catch (dbError) {
          logger.error("同步存储配置失败:", dbError)
        }
      }

      logger.database('UPDATE', 'storage_strategies')
      logger.info(`存储策略状态切换成功: ${id}`)
      return { message: "存储策略状态切换成功" }
    } catch (error) {
      logger.error("切换存储策略状态失败:", error)
      set.status = 500
      return { error: "切换存储策略状态失败" }
    }
  }, {
    body: t.Object({
      isActive: t.Boolean(),
    }),
  })

  // ===== OneDrive 认证和管理 API =====
  
  // 获取OneDrive认证URL
  .get("/onedrive/auth-url", async ({ query, set }) => {
    try {
      const { redirectUri } = query as { redirectUri?: string }
      
      if (!redirectUri) {
        set.status = 400
        return { error: "Missing redirectUri parameter" }
      }

      logger.debug(`获取OneDrive认证URL: ${redirectUri}`)

      // 获取存储配置
      const config = await db.select().from(storageConfig).get()
      if (!config || !config.oneDriveClientId || !config.oneDriveTenantId) {
        set.status = 400
        return { error: "OneDrive not configured" }
      }

      const oneDriveService = new OneDriveService({
        clientId: config.oneDriveClientId,
        clientSecret: config.oneDriveClientSecret || '',
        tenantId: config.oneDriveTenantId,
      })

      const authUrl = oneDriveService.getAuthUrl(redirectUri)
      
      logger.info(`OneDrive认证URL生成成功`)
      return { authUrl }
    } catch (error) {
      logger.error("获取OneDrive认证URL失败:", error)
      set.status = 500
      return { error: "Failed to get OneDrive auth URL" }
    }
  }, {
    query: t.Object({
      redirectUri: t.String(),
    }),
  })

  // OneDrive认证回调处理
  .post("/onedrive/callback", async ({ body, user, set }) => {
    try {
      const { code, redirectUri } = body

      logger.info(`处理OneDrive认证回调: 用户 ${user.userId}`)

      // 获取存储配置
      const config = await db.select().from(storageConfig).get()
      if (!config || !config.oneDriveClientId || !config.oneDriveTenantId) {
        set.status = 400
        return { error: "OneDrive not configured" }
      }

      const oneDriveService = new OneDriveService({
        clientId: config.oneDriveClientId,
        clientSecret: config.oneDriveClientSecret || '',
        tenantId: config.oneDriveTenantId,
      })

      // 交换访问令牌
      const tokenData = await oneDriveService.getTokenFromCode(code, redirectUri)
      
      // 保存或更新认证信息
      const existingAuth = await db
        .select()
        .from(oneDriveAuth)
        .where(eq(oneDriveAuth.userId, user.userId))
        .get()

      const authId = existingAuth?.id || nanoid()
      const now = Date.now()

      if (existingAuth) {
        await db
          .update(oneDriveAuth)
          .set({
            accessToken: tokenData.accessToken,
            refreshToken: tokenData.refreshToken,
            expiresAt: tokenData.expiresAt,
            scope: tokenData.scope || 'Files.ReadWrite.All',
            updatedAt: now,
          })
          .where(eq(oneDriveAuth.id, authId))
      } else {
        await db.insert(oneDriveAuth).values({
          id: authId,
          userId: user.userId,
          accessToken: tokenData.accessToken,
          refreshToken: tokenData.refreshToken,
          expiresAt: tokenData.expiresAt,
          scope: tokenData.scope || 'Files.ReadWrite.All',
          createdAt: now,
          updatedAt: now,
        })
      }

      logger.database('UPSERT', 'onedrive_auth')
      logger.info(`OneDrive认证成功: 用户 ${user.userId}`)
      return { message: "OneDrive authentication successful" }
    } catch (error) {
      logger.error("OneDrive认证回调处理失败:", error)
      set.status = 500
      return { error: "OneDrive authentication failed" }
    }
  }, {
    body: t.Object({
      code: t.String(),
      redirectUri: t.String(),
    }),
  })

  // 获取OneDrive认证状态
  .get("/onedrive/status", async ({ user }) => {
    try {
      logger.debug(`检查OneDrive认证状态: 用户 ${user.userId}`)

      const auth = await db
        .select()
        .from(oneDriveAuth)
        .where(eq(oneDriveAuth.userId, user.userId))
        .get()

      if (!auth) {
        return { connected: false, authenticated: false }
      }

      // 检查令牌是否过期
      const isExpired = auth.expiresAt <= Date.now()
      
      return {
        connected: !isExpired,
        authenticated: !isExpired,
        expiresAt: auth.expiresAt,
        scope: auth.scope
      }
    } catch (error) {
      logger.error("检查OneDrive认证状态失败:", error)
      return { authenticated: false }
    }
  })

  // ===== OneDrive 挂载点管理 API =====
  
  // 获取OneDrive挂载点列表
  .get("/onedrive/mounts", async ({ user }) => {
    try {
      logger.debug(`获取OneDrive挂载点: 用户 ${user.userId}`)
      
      const mounts = await db
        .select()
        .from(oneDriveMountPoints)
        .where(eq(oneDriveMountPoints.userId, user.userId))
        .all()
      
      logger.info(`返回 ${mounts.length} 个OneDrive挂载点`)
      return { mounts }
    } catch (error) {
      logger.error("获取OneDrive挂载点失败:", error)
      return { mounts: [] }
    }
  })

  // 创建OneDrive挂载点
  .post("/onedrive/mount", async ({ body, user, set }) => {
    try {
      const { folderId, oneDrivePath, oneDriveItemId, mountName } = body

      logger.info(`创建OneDrive挂载点: ${mountName}`)

      // 验证必填字段
      if (!folderId || !mountName.trim()) {
        set.status = 400
        return { error: "缺少必填字段" }
      }

      // 检查挂载点名称是否已存在
      const existingMount = await db
        .select()
        .from(oneDriveMountPoints)
        .where(eq(oneDriveMountPoints.mountName, mountName.trim()))
        .get()

      if (existingMount) {
        set.status = 400
        return { error: "挂载点名称已存在" }
      }

      const mountId = nanoid()
      const now = Date.now()

      await db.insert(oneDriveMountPoints).values({
        id: mountId,
        userId: user.userId,
        folderId,
        oneDrivePath: oneDrivePath || "/",
        oneDriveItemId: oneDriveItemId || null,
        mountName: mountName.trim(),
        enabled: true,
        createdAt: now,
        updatedAt: now,
      })

      logger.database('INSERT', 'onedrive_mount_points')
      logger.info(`OneDrive挂载点创建成功: ${mountName}`)
      return { message: "OneDrive挂载点创建成功", mountId }
    } catch (error) {
      logger.error("创建OneDrive挂载点失败:", error)
      set.status = 500
      return { error: "创建挂载点失败" }
    }
  }, {
    body: t.Object({
      folderId: t.String(),
      oneDrivePath: t.Optional(t.String()),
      oneDriveItemId: t.Optional(t.String()),
      mountName: t.String(),
    }),
  })

  // 删除OneDrive挂载点
  .delete("/onedrive/mounts/:id", async ({ params, user, set }) => {
    try {
      const { id } = params

      logger.info(`删除OneDrive挂载点: ${id}`)

      const mount = await db
        .select()
        .from(oneDriveMountPoints)
        .where(and(eq(oneDriveMountPoints.id, id), eq(oneDriveMountPoints.userId, user.userId)))
        .get()

      if (!mount) {
        set.status = 404
        return { error: "挂载点不存在" }
      }

      await db
        .delete(oneDriveMountPoints)
        .where(eq(oneDriveMountPoints.id, id))

      logger.database('DELETE', 'onedrive_mount_points')
      logger.info(`OneDrive挂载点删除成功: ${id}`)
      return { message: "挂载点删除成功" }
    } catch (error) {
      logger.error("删除OneDrive挂载点失败:", error)
      set.status = 500
      return { error: "删除挂载点失败" }
    }
  })

  // 其他现有的存储路由...
  // 浏览 R2 存储桶目录
  .get("/r2/browse", async ({ query, set }) => {
    try {
      const { prefix = "" } = query

      logger.debug(`浏览 R2 目录: ${prefix}`)

      const config = await db.select().from(storageConfig).get()
      if (!config || (!config.enableMixedMode && config.storageType !== "r2")) {
        set.status = 400
        return { error: "R2 storage not configured" }
      }

      const storageService = new StorageService(config)
      const result = await storageService.listR2Objects(prefix)

      logger.info(`R2 目录浏览完成: ${prefix}`)
      return result
    } catch (error) {
      logger.error("R2 目录浏览失败:", error)
      set.status = 500
      return { error: "Failed to browse R2 directory" }
    }
  }, {
    query: t.Object({
      prefix: t.Optional(t.String()),
    }),
  })