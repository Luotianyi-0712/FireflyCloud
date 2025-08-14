import { Elysia, t } from "elysia"
import { jwt } from "@elysiajs/jwt"
import { bearer } from "@elysiajs/bearer"
import { nanoid } from "nanoid"
import { db } from "../db"
import { files, storageConfig, folders, downloadTokens, fileDirectLinks, fileShares } from "../db/schema"
import { eq, and, isNull } from "drizzle-orm"
import { StorageService } from "../services/storage"
import { logger } from "../utils/logger"

export const fileRoutes = new Elysia({ prefix: "/files" })
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
    if (!payload) {
      set.status = 401
      throw new Error("Invalid token")
    }

    return { user: payload }
  })
  .get("/", async ({ user, query }) => {
    logger.debug(`获取用户文件列表: ${user.userId}`)

    let fileQuery = db.select().from(files).where(eq(files.userId, user.userId))

    // 如果指定了文件夹ID，只获取该文件夹下的文件
    if (query.folderId !== undefined) {
      const folderId = query.folderId === "root" ? null : query.folderId
      fileQuery = fileQuery.where(
        folderId ? eq(files.folderId, folderId) : isNull(files.folderId)
      )
    }

    const userFiles = await fileQuery
    logger.info(`用户 ${user.userId} 获取了 ${userFiles.length} 个文件`)
    return { files: userFiles }
  })
  .post(
    "/upload",
    async ({ body, user, set }) => {
      try {
        const { file, folderId } = body

        if (!file || !(file instanceof File)) {
          logger.warn(`文件上传失败: 用户 ${user.userId} 未提供文件`)
          set.status = 400
          return { error: "No file provided" }
        }

        // 验证文件夹是否存在且属于当前用户
        if (folderId) {
          const folder = await db
            .select()
            .from(folders)
            .where(and(eq(folders.id, folderId), eq(folders.userId, user.userId)))
            .get()

          if (!folder) {
            logger.warn(`文件夹不存在: ${folderId} - 用户: ${user.userId}`)
            set.status = 404
            return { error: "Folder not found" }
          }
        }

        logger.info(`开始上传文件: ${file.name} (${file.size} bytes) 到文件夹: ${folderId || "root"} - 用户: ${user.userId}`)

        // Get storage config
        const config = await db.select().from(storageConfig).get()
        if (!config) {
          logger.error("存储配置未找到")
          set.status = 500
          return { error: "Storage not configured" }
        }

        const storageService = new StorageService(config)
        const fileId = nanoid()
        const filename = `${fileId}-${file.name}`

        // Upload file
        const storagePath = await storageService.uploadFile(file, filename)
        logger.file('UPLOAD', file.name, file.size, true)

        // Save to database
        await db.insert(files).values({
          id: fileId,
          userId: user.userId,
          folderId: folderId || null,
          filename,
          originalName: file.name,
          size: file.size,
          mimeType: file.type,
          storageType: config.storageType,
          storagePath,
          createdAt: Date.now(),
        })

        logger.database('INSERT', 'files')
        logger.info(`文件上传成功: ${file.name} - ID: ${fileId}`)

        return {
          message: "File uploaded successfully",
          file: {
            id: fileId,
            filename,
            originalName: file.name,
            size: file.size,
            mimeType: file.type,
            folderId: folderId || null,
          },
        }
      } catch (error) {
        logger.error("文件上传失败:", error)
        logger.file('UPLOAD', body?.file?.name || 'unknown', body?.file?.size, false, error)
        set.status = 500
        return { error: "Upload failed" }
      }
    },
    {
      body: t.Object({
        file: t.File(),
        folderId: t.Optional(t.String()),
      }),
    },
  )
  .get("/:id/download", async ({ params, user, set }) => {
    try {
      logger.debug(`请求下载令牌: ${params.id} - 用户: ${user.userId}`)

      const file = await db
        .select()
        .from(files)
        .where(and(eq(files.id, params.id), eq(files.userId, user.userId)))
        .get()

      if (!file) {
        logger.warn(`文件未找到: ${params.id} - 用户: ${user.userId}`)
        set.status = 404
        return { error: "File not found" }
      }

      // 生成一次性下载令牌
      const tokenId = nanoid()
      const downloadToken = nanoid(32)
      const expiresAt = Date.now() + 5 * 60 * 1000 // 5分钟过期

      await db.insert(downloadTokens).values({
        id: tokenId,
        fileId: file.id,
        userId: user.userId,
        token: downloadToken,
        used: false,
        expiresAt,
        createdAt: Date.now(),
      })

      logger.info(`生成下载令牌: ${file.originalName} - 用户: ${user.userId} - 令牌: ${tokenId}`)

      // 返回下载URL，包含令牌
      const downloadUrl = `${process.env.BACKEND_URL || "http://localhost:8080"}/files/download/${downloadToken}`

      return { downloadUrl }
    } catch (error) {
      logger.error("生成下载令牌失败:", error)
      set.status = 500
      return { error: "Download token generation failed" }
    }
  })
  // 获取文件直链
  .get("/:id/direct-link", async ({ params, user, set }) => {
    try {
      logger.debug(`获取文件直链: ${params.id} - 用户: ${user.userId}`)

      const file = await db
        .select()
        .from(files)
        .where(and(eq(files.id, params.id), eq(files.userId, user.userId)))
        .get()

      if (!file) {
        logger.warn(`文件未找到: ${params.id} - 用户: ${user.userId}`)
        set.status = 404
        return { error: "File not found" }
      }

      // 查找是否已存在直链
      let directLink = await db
        .select()
        .from(fileDirectLinks)
        .where(eq(fileDirectLinks.fileId, file.id))
        .get()

      if (!directLink) {
        // 生成直链文件名，确保唯一性
        let directName = file.originalName
        let counter = 1

        // 检查文件名是否已被使用
        while (true) {
          const existing = await db
            .select()
            .from(fileDirectLinks)
            .where(eq(fileDirectLinks.directName, directName))
            .get()

          if (!existing) break

          // 如果文件名已存在，添加数字后缀
          const lastDotIndex = file.originalName.lastIndexOf('.')
          if (lastDotIndex > 0) {
            const nameWithoutExt = file.originalName.substring(0, lastDotIndex)
            const extension = file.originalName.substring(lastDotIndex)
            directName = `${nameWithoutExt}_${counter}${extension}`
          } else {
            directName = `${file.originalName}_${counter}`
          }
          counter++
        }

        // 创建新的直链
        const linkId = nanoid()
        const now = Date.now()

        await db.insert(fileDirectLinks).values({
          id: linkId,
          fileId: file.id,
          userId: user.userId,
          directName: directName,
          enabled: true,
          accessCount: 0,
          createdAt: now,
          updatedAt: now,
        })

        directLink = {
          id: linkId,
          fileId: file.id,
          userId: user.userId,
          directName: directName,
          enabled: true,
          accessCount: 0,
          createdAt: now,
          updatedAt: now,
        }

        logger.info(`创建文件直链: ${file.originalName} -> ${directName} - 用户: ${user.userId}`)
      }

      const directUrl = `${process.env.BACKEND_URL || "http://localhost:8080"}/files/direct/${directLink.directName}`

      return {
        directUrl,
        enabled: directLink.enabled,
        accessCount: directLink.accessCount,
        createdAt: directLink.createdAt
      }
    } catch (error) {
      logger.error("获取文件直链失败:", error)
      set.status = 500
      return { error: "Get direct link failed" }
    }
  })
  // 禁用/启用文件直链
  .put("/:id/direct-link", async ({ params, user, body, set }) => {
    try {
      logger.debug(`更新文件直链状态: ${params.id} - 用户: ${user.userId}`)

      const file = await db
        .select()
        .from(files)
        .where(and(eq(files.id, params.id), eq(files.userId, user.userId)))
        .get()

      if (!file) {
        logger.warn(`文件未找到: ${params.id} - 用户: ${user.userId}`)
        set.status = 404
        return { error: "File not found" }
      }

      const { enabled } = body as { enabled: boolean }

      const result = await db
        .update(fileDirectLinks)
        .set({
          enabled,
          updatedAt: Date.now()
        })
        .where(and(eq(fileDirectLinks.fileId, file.id), eq(fileDirectLinks.userId, user.userId)))

      logger.info(`更新文件直链状态: ${file.originalName} - 启用: ${enabled} - 用户: ${user.userId}`)

      return { success: true, enabled }
    } catch (error) {
      logger.error("更新文件直链状态失败:", error)
      set.status = 500
      return { error: "Update direct link failed" }
    }
  })
  // 创建文件分享
  .post("/:id/share", async ({ params, user, body, set }) => {
    try {
      logger.debug(`创建文件分享: ${params.id} - 用户: ${user.userId}`)

      const file = await db
        .select()
        .from(files)
        .where(and(eq(files.id, params.id), eq(files.userId, user.userId)))
        .get()

      if (!file) {
        logger.warn(`文件未找到: ${params.id} - 用户: ${user.userId}`)
        set.status = 404
        return { error: "File not found" }
      }

      const { requireLogin, usePickupCode } = body as {
        requireLogin: boolean
        usePickupCode: boolean
      }

      // 生成分享token和取件码
      const shareToken = nanoid(32)
      const pickupCode = usePickupCode ? Math.floor(100000 + Math.random() * 900000).toString() : null
      const shareId = nanoid()
      const now = Date.now()

      await db.insert(fileShares).values({
        id: shareId,
        fileId: file.id,
        userId: user.userId,
        shareToken,
        pickupCode,
        requireLogin,
        enabled: true,
        accessCount: 0,
        expiresAt: null, // 暂时不设置过期时间
        createdAt: now,
        updatedAt: now,
      })

      const shareUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/share/${shareToken}`

      logger.info(`创建文件分享: ${file.originalName} - 用户: ${user.userId} - 分享ID: ${shareId}`)

      return {
        shareUrl,
        shareToken,
        pickupCode,
        requireLogin,
        createdAt: now
      }
    } catch (error) {
      logger.error("创建文件分享失败:", error)
      set.status = 500
      return { error: "Create share failed" }
    }
  })
  .delete("/:id", async ({ params, user, set }) => {
    try {
      logger.debug(`请求删除文件: ${params.id} - 用户: ${user.userId}`)

      const file = await db
        .select()
        .from(files)
        .where(and(eq(files.id, params.id), eq(files.userId, user.userId)))
        .get()

      if (!file) {
        logger.warn(`删除失败，文件未找到: ${params.id} - 用户: ${user.userId}`)
        set.status = 404
        return { error: "File not found" }
      }

      const config = await db.select().from(storageConfig).get()
      if (!config) {
        logger.error("存储配置未找到")
        set.status = 500
        return { error: "Storage not configured" }
      }

      const storageService = new StorageService(config)
      await storageService.deleteFile(file.storagePath)
      logger.file('DELETE', file.originalName, file.size, true)

      await db.delete(files).where(eq(files.id, params.id))
      logger.database('DELETE', 'files')

      logger.info(`文件删除成功: ${file.originalName} - 用户: ${user.userId}`)
      return { message: "File deleted successfully" }
    } catch (error) {
      logger.error("文件删除失败:", error)
      logger.file('DELETE', 'unknown', 0, false, error)
      set.status = 500
      return { error: "Delete failed" }
    }
  })
