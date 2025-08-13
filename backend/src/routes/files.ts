import { Elysia, t } from "elysia"
import { jwt } from "@elysiajs/jwt"
import { bearer } from "@elysiajs/bearer"
import { nanoid } from "nanoid"
import { db } from "../db"
import { files, storageConfig } from "../db/schema"
import { eq, and } from "drizzle-orm"
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
  .get("/", async ({ user }) => {
    logger.debug(`获取用户文件列表: ${user.userId}`)
    const userFiles = await db.select().from(files).where(eq(files.userId, user.userId))
    logger.info(`用户 ${user.userId} 获取了 ${userFiles.length} 个文件`)
    return { files: userFiles }
  })
  .post(
    "/upload",
    async ({ body, user, set }) => {
      try {
        const { file } = body

        if (!file || !(file instanceof File)) {
          logger.warn(`文件上传失败: 用户 ${user.userId} 未提供文件`)
          set.status = 400
          return { error: "No file provided" }
        }

        logger.info(`开始上传文件: ${file.name} (${file.size} bytes) - 用户: ${user.userId}`)

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
      }),
    },
  )
  .get("/:id/download", async ({ params, user, set }) => {
    try {
      logger.debug(`请求下载文件: ${params.id} - 用户: ${user.userId}`)

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

      const config = await db.select().from(storageConfig).get()
      if (!config) {
        logger.error("存储配置未找到")
        set.status = 500
        return { error: "Storage not configured" }
      }

      logger.file('DOWNLOAD', file.originalName, file.size, true)
      logger.info(`文件下载: ${file.originalName} - 用户: ${user.userId}`)

      const storageService = new StorageService(config)
      const downloadUrl = await storageService.getDownloadUrl(file.storagePath)

      return { downloadUrl }
    } catch (error) {
      logger.error("文件下载失败:", error)
      set.status = 500
      return { error: "Download failed" }
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
