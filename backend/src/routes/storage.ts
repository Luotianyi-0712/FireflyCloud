import { Elysia, t } from "elysia"
import { jwt } from "@elysiajs/jwt"
import { bearer } from "@elysiajs/bearer"
import { db } from "../db"
import { storageConfig, r2MountPoints } from "../db/schema"
import { StorageService } from "../services/storage"
import { logger } from "../utils/logger"
import { nanoid } from "nanoid"
import { eq, and } from "drizzle-orm"

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
        enableMixedMode: config?.enableMixedMode || false,
      },
    }
  })
  .put(
    "/config",
    async ({ body, set }) => {
      try {
        const { storageType, r2Endpoint, r2AccessKey, r2SecretKey, r2Bucket, enableMixedMode } = body

        logger.info(`更新存储配置: ${storageType}, 混合模式: ${enableMixedMode}`)
        logger.debug("存储配置详情:", { storageType, r2Endpoint, r2Bucket, enableMixedMode })

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
              enableMixedMode: enableMixedMode || false,
              updatedAt: Date.now(),
            })
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
            enableMixedMode: enableMixedMode || false,
            updatedAt: Date.now(),
          })
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
        storageType: t.Union([t.Literal("local"), t.Literal("r2")]),
        r2Endpoint: t.Optional(t.String()),
        r2AccessKey: t.Optional(t.String()),
        r2SecretKey: t.Optional(t.String()),
        r2Bucket: t.Optional(t.String()),
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
