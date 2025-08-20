import { Elysia, t } from "elysia"
import { jwt } from "@elysiajs/jwt"
import { bearer } from "@elysiajs/bearer"
import { db } from "../db"
import { storageConfig, r2MountPoints, oneDriveMountPoints, oneDriveAuth, folders } from "../db/schema"
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
        storageType: t.Union([t.Literal("local"), t.Literal("r2"), t.Literal("onedrive")]),
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
  // 创建 R2 挂载点
  .post("/r2/mount", async ({ body, user, set }) => {
    try {
      const { folderId, r2Path, mountName } = body

      logger.info(`创建 R2 挂载点: ${mountName} -> ${r2Path}`)

      // 检查挂载点是否已存在
      const existingMount = await db
        .select()
        .from(r2MountPoints)
        .where(
          and(
            eq(r2MountPoints.userId, user.userId),
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
        userId: user.userId,
        folderId,
        r2Path,
        mountName,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      })

      logger.database('INSERT', 'r2_mount_points')
      logger.info(`R2 挂载点创建成功: ${mountName}`)

      return { message: "Mount point created successfully", mountId }
    } catch (error) {
      logger.error("创建 R2 挂载点失败:", error)
      set.status = 500
      return { error: "Failed to create mount point" }
    }
  }, {
    body: t.Object({
      folderId: t.String(),
      r2Path: t.String(),
      mountName: t.String(),
    }),
  })
  // 获取用户的 R2 挂载点
  .get("/r2/mounts", async ({ user }) => {
    logger.debug(`获取用户 R2 挂载点: ${user.userId}`)

    const mounts = await db
      .select()
      .from(r2MountPoints)
      .where(eq(r2MountPoints.userId, user.userId))

    logger.info(`用户 ${user.userId} 有 ${mounts.length} 个 R2 挂载点`)
    return { mounts }
  })
  // 删除 R2 挂载点
  .delete("/r2/mount/:id", async ({ params, user, set }) => {
    try {
      const mountId = params.id

      logger.info(`删除 R2 挂载点: ${mountId}`)

      const mount = await db
        .select()
        .from(r2MountPoints)
        .where(
          and(
            eq(r2MountPoints.id, mountId),
            eq(r2MountPoints.userId, user.userId)
          )
        )
        .get()

      if (!mount) {
        set.status = 404
        return { error: "Mount point not found" }
      }

      await db
        .delete(r2MountPoints)
        .where(eq(r2MountPoints.id, mountId))

      logger.database('DELETE', 'r2_mount_points')
      logger.info(`R2 挂载点删除成功: ${mountId}`)

      return { message: "Mount point deleted successfully" }
    } catch (error) {
      logger.error("删除 R2 挂载点失败:", error)
      set.status = 500
      return { error: "Failed to delete mount point" }
    }
  })
  // 生成 R2 文件下载链接
  .post("/r2/download-url", async ({ body, set }) => {
    try {
      const { key } = body

      logger.debug(`生成 R2 下载链接: ${key}`)

      const config = await db.select().from(storageConfig).get()
      if (!config || (!config.enableMixedMode && config.storageType !== "r2")) {
        set.status = 400
        return { error: "R2 storage not configured" }
      }

      const storageService = new StorageService(config)
      const downloadUrl = await storageService.getR2PublicUrl(key)

      logger.info(`R2 下载链接生成成功: ${key}`)
      return { downloadUrl }
    } catch (error) {
      logger.error("生成 R2 下载链接失败:", error)
      set.status = 500
      return { error: "Failed to generate download URL" }
    }
  }, {
    body: t.Object({
      key: t.String(),
    }),
  })

  // OneDrive OAuth 授权URL
  .get("/onedrive/auth-url", async ({ query, set }) => {
    try {
      const { redirectUri, state } = query as { redirectUri?: string; state?: string }

      if (!redirectUri) {
        set.status = 400
        return { error: "Redirect URI is required" }
      }

      logger.debug(`生成OneDrive授权URL: ${redirectUri}`)

      const config = await db.select().from(storageConfig).get()
      if (!config || !config.oneDriveClientId) {
        set.status = 400
        return { error: "OneDrive not configured" }
      }

      const oneDriveService = new OneDriveService({
        clientId: config.oneDriveClientId,
        clientSecret: config.oneDriveClientSecret || "",
        tenantId: config.oneDriveTenantId || "common",
      })

      const authUrl = oneDriveService.getAuthUrl(redirectUri, state)

      logger.info("OneDrive授权URL生成成功")
      return { authUrl }
    } catch (error) {
      logger.error("生成OneDrive授权URL失败:", error)
      set.status = 500
      return { error: "Failed to generate auth URL" }
    }
  })

  // OneDrive OAuth 回调处理
  .post("/onedrive/callback", async ({ body, user, set }) => {
    try {
      const { code, redirectUri } = body

      logger.info(`处理OneDrive OAuth回调: 用户 ${user.userId}`)

      const config = await db.select().from(storageConfig).get()
      if (!config || !config.oneDriveClientId) {
        set.status = 400
        return { error: "OneDrive not configured" }
      }

      const oneDriveService = new OneDriveService({
        clientId: config.oneDriveClientId,
        clientSecret: config.oneDriveClientSecret || "",
        tenantId: config.oneDriveTenantId || "common",
      })

      // 获取访问令牌
      const tokens = await oneDriveService.getTokenFromCode(code, redirectUri)

      // 保存或更新用户的OneDrive认证信息
      const existingAuth = await db
        .select()
        .from(oneDriveAuth)
        .where(eq(oneDriveAuth.userId, user.userId))
        .get()

      const now = Date.now()
      const authId = existingAuth?.id || nanoid()

      if (existingAuth) {
        await db
          .update(oneDriveAuth)
          .set({
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresAt: tokens.expiresAt,
            scope: tokens.scope,
            updatedAt: now,
          })
          .where(eq(oneDriveAuth.id, authId))
        logger.database('UPDATE', 'onedrive_auth')
      } else {
        await db.insert(oneDriveAuth).values({
          id: authId,
          userId: user.userId,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
          scope: tokens.scope,
          createdAt: now,
          updatedAt: now,
        })
        logger.database('INSERT', 'onedrive_auth')
      }

      logger.info(`OneDrive认证成功: 用户 ${user.userId}`)
      return { message: "OneDrive authentication successful" }
    } catch (error) {
      logger.error("OneDrive OAuth回调处理失败:", error)
      set.status = 500
      return { error: "Failed to process OneDrive callback" }
    }
  }, {
    body: t.Object({
      code: t.String(),
      redirectUri: t.String(),
    }),
  })

  // 创建 OneDrive 挂载点
  .post("/onedrive/mount", async ({ body, user, set }) => {
    try {
      const { folderId, oneDrivePath, oneDriveItemId, mountName } = body

      logger.info(`创建 OneDrive 挂载点: ${mountName} -> ${oneDrivePath}`)

      // 判断是否为 WebDAV 配置
      const config = await db.select().from(storageConfig).get()
      const webdavConfigured = !!(config?.oneDriveWebDavUrl && config?.oneDriveWebDavUser && config?.oneDriveWebDavPass)

      if (!webdavConfigured) {
        // 非 WebDAV 情况下，要求已完成 OneDrive OAuth 认证
        const auth = await db
          .select()
          .from(oneDriveAuth)
          .where(eq(oneDriveAuth.userId, user.userId))
          .get()

        if (!auth) {
          set.status = 400
          return { error: "OneDrive not authenticated" }
        }
      }

      // 检查挂载点是否已存在
      const existingMount = await db
        .select()
        .from(oneDriveMountPoints)
        .where(
          and(
            eq(oneDriveMountPoints.userId, user.userId),
            eq(oneDriveMountPoints.folderId, folderId)
          )
        )
        .get()

      if (existingMount) {
        set.status = 400
        return { error: "Mount point already exists for this folder" }
      }

      const mountId = nanoid()
      const now = Date.now()

      await db.insert(oneDriveMountPoints).values({
        id: mountId,
        userId: user.userId,
        folderId,
        oneDrivePath,
        oneDriveItemId,
        mountName,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      })

      logger.database('INSERT', 'onedrive_mount_points')
      logger.info(`OneDrive 挂载点创建成功: ${mountName}`)

      return { message: "Mount point created successfully", mountId }
    } catch (error) {
      logger.error("创建 OneDrive 挂载点失败:", error)
      set.status = 500
      return { error: "Failed to create mount point" }
    }
  }, {
    body: t.Object({
      folderId: t.String(),
      oneDrivePath: t.String(),
      oneDriveItemId: t.Optional(t.String()),
      mountName: t.String(),
    }),
  })

  // 获取用户的 OneDrive 挂载点
  .get("/onedrive/mounts", async ({ user }) => {
    logger.debug(`获取用户 OneDrive 挂载点: ${user.userId}`)

    const mounts = await db
      .select()
      .from(oneDriveMountPoints)
      .where(eq(oneDriveMountPoints.userId, user.userId))

    logger.info(`用户 ${user.userId} 有 ${mounts.length} 个 OneDrive 挂载点`)
    return { mounts }
  })

  // 删除 OneDrive 挂载点
  .delete("/onedrive/mounts/:id", async ({ params, user, set }) => {
    try {
      const { id } = params

      logger.info(`删除 OneDrive 挂载点: ${id}`)

      const existingMount = await db
        .select()
        .from(oneDriveMountPoints)
        .where(
          and(
            eq(oneDriveMountPoints.id, id),
            eq(oneDriveMountPoints.userId, user.userId)
          )
        )
        .get()

      if (!existingMount) {
        set.status = 404
        return { error: "Mount point not found" }
      }

      await db
        .delete(oneDriveMountPoints)
        .where(eq(oneDriveMountPoints.id, id))

      logger.database('DELETE', 'onedrive_mount_points')
      logger.info(`OneDrive 挂载点删除成功: ${id}`)

      return { message: "Mount point deleted successfully" }
    } catch (error) {
      logger.error("删除 OneDrive 挂载点失败:", error)
      set.status = 500
      return { error: "Failed to delete mount point" }
    }
  })

  // 浏览 WebDAV（OneDrive）挂载内容
  .get("/onedrive/webdav/browse", async ({ query, user, set }) => {
    try {
      const { mountId, subPath } = query as { mountId?: string; subPath?: string }
      if (!mountId) {
        set.status = 400
        return { error: "mountId is required" }
      }

      // 读取存储配置并校验 WebDAV 是否可用
      const config = await db.select().from(storageConfig).get()
      const webdavConfigured = !!(config?.oneDriveWebDavUrl && config?.oneDriveWebDavUser && config?.oneDriveWebDavPass)
      if (!webdavConfigured) {
        set.status = 400
        return { error: "WebDAV not configured" }
      }

      // 校验挂载点归属
      const mountPoint = await db
        .select()
        .from(oneDriveMountPoints)
        .where(and(eq(oneDriveMountPoints.id, mountId), eq(oneDriveMountPoints.userId, user.userId)))
        .get()

      if (!mountPoint) {
        set.status = 404
        return { error: "Mount point not found" }
      }

      // 规范化路径，限制在挂载根目录下
      const basePath = (mountPoint.oneDrivePath || "").replace(/^\/+|\/+$/g, "")
      const relative = (subPath || "").replace(/^\/+/, "").replace(/\.\./g, "")
      const joined = [basePath, relative].filter(Boolean).join("/")
      const targetPath = ("/" + joined).replace(/\/+/g, "/") || "/"

      // 动态引入 webdav 客户端
      const { createClient } = await import("webdav")
      const client = createClient(config.oneDriveWebDavUrl!, {
        username: (config as any).oneDriveWebDavUser,
        password: (config as any).oneDriveWebDavPass,
      })

      const contents: any[] = await client.getDirectoryContents(targetPath, { deep: false })

      const folders = contents
        .filter((item) => item.type === "directory")
        .map((dir) => {
          const name = dir.basename || dir.filename?.split("/").pop() || ""
          const path = dir.filename || dir.path || (targetPath === "/" ? `/${name}` : `${targetPath}/${name}`)
          return { id: dir.etag || name, name, path, mountPointId: mountPoint.id, itemCount: undefined, lastmod: dir.lastmod }
        })

      const files = contents
        .filter((item) => item.type === "file")
        .map((f) => {
          const name = f.basename || f.filename?.split("/").pop() || ""
          const path = f.filename || f.path || (targetPath === "/" ? `/${name}` : `${targetPath}/${name}`)
          return {
            id: f.etag || path,
            name,
            path,
            size: typeof f.size === "number" ? f.size : 0,
            lastmod: f.lastmod,
          }
        })

      logger.info(`WebDAV 浏览: ${targetPath} - 目录 ${folders.length}，文件 ${files.length}`)
      return { mountPoint: { id: mountPoint.id, basePath: mountPoint.oneDrivePath, currentPath: targetPath }, folders, files }
    } catch (error) {
      logger.error("WebDAV 浏览失败:", error)
      set.status = 500
      return { error: "Failed to browse WebDAV contents" }
    }
  }, {
    query: t.Object({
      mountId: t.String(),
      subPath: t.Optional(t.String()),
    })
  })

  // 下载 WebDAV（OneDrive）文件
  .get("/onedrive/webdav/download", async ({ query, user, set }) => {
    try {
      const { mountId, path: filePath, filename } = query as { mountId?: string; path?: string; filename?: string }
      if (!mountId || !filePath) {
        set.status = 400
        return { error: "mountId and path are required" }
      }

      const config = await db.select().from(storageConfig).get()
      const webdavConfigured = !!(config?.oneDriveWebDavUrl && config?.oneDriveWebDavUser && config?.oneDriveWebDavPass)
      if (!webdavConfigured) {
        set.status = 400
        return { error: "WebDAV not configured" }
      }

      const mountPoint = await db
        .select()
        .from(oneDriveMountPoints)
        .where(and(eq(oneDriveMountPoints.id, mountId), eq(oneDriveMountPoints.userId, user.userId)))
        .get()

      if (!mountPoint) {
        set.status = 404
        return { error: "Mount point not found" }
      }

      // 校验请求路径在挂载根目录下
      const basePath = (mountPoint.oneDrivePath || "").replace(/^\/+|\/+$/g, "")
      const requested = (filePath || "").replace(/\\/g, "/")
      const normalized = ("/" + [basePath, requested.replace(/^\/+/, "")].filter(Boolean).join("/")).replace(/\/+/g, "/")
      if (!(normalized === "/" + basePath || normalized.startsWith("/" + basePath + "/") || (basePath === ""))) {
        set.status = 403
        return { error: "Access outside of mount is not allowed" }
      }

      const { createClient } = await import("webdav")
      const client = createClient(config.oneDriveWebDavUrl!, {
        username: (config as any).oneDriveWebDavUser,
        password: (config as any).oneDriveWebDavPass,
      })

      // 获取文件内容
      const fileBuffer = await client.getFileContents(normalized, { format: "binary" }) as Buffer

      const name = filename || normalized.split("/").pop() || "download.bin"
      set.headers["Content-Type"] = "application/octet-stream"
      set.headers["Content-Disposition"] = `attachment; filename="${encodeURIComponent(name)}"`
      set.headers["Content-Length"] = String(fileBuffer.length)
      return fileBuffer
    } catch (error) {
      logger.error("WebDAV 文件下载失败:", error)
      set.status = 500
      return { error: "Failed to download WebDAV file" }
    }
  }, {
    query: t.Object({
      mountId: t.String(),
      path: t.String(),
      filename: t.Optional(t.String()),
    })
  })
