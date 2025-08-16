import { Elysia } from "elysia"
import { db } from "../db"
import { files, storageConfig, downloadTokens, fileDirectLinks } from "../db/schema"
import { eq } from "drizzle-orm"
import { StorageService } from "../services/storage"
import { logger } from "../utils/logger"

export const downloadRoutes = new Elysia({ prefix: "/files" })
  // 实际文件下载路由（使用一次性令牌，无需认证）
  .get("/download/:token", async ({ params, set }) => {
    try {
      logger.debug(`使用令牌下载文件: ${params.token}`)

      // 查找下载令牌
      const tokenRecord = await db
        .select()
        .from(downloadTokens)
        .where(eq(downloadTokens.token, params.token))
        .get()

      if (!tokenRecord) {
        logger.warn(`下载令牌无效: ${params.token}`)
        set.status = 404
        return { error: "Invalid download token" }
      }

      // 检查令牌使用次数
      const usageCount = tokenRecord.usageCount ?? 0
      const maxUsage = tokenRecord.maxUsage ?? 2

      // 兼容旧数据：如果 used=true 但 usageCount=0，说明是旧数据，已经用完
      if (tokenRecord.used && usageCount === 0) {
        logger.warn(`下载令牌已使用（旧数据）: ${params.token}`)
        set.status = 410
        return { error: "Download token already used" }
      }

      if (usageCount >= maxUsage) {
        logger.warn(`下载令牌使用次数已达上限: ${params.token} (${usageCount}/${maxUsage})`)
        set.status = 410
        return { error: "Download token usage limit exceeded" }
      }

      // 检查令牌是否过期
      if (Date.now() > tokenRecord.expiresAt) {
        logger.warn(`下载令牌已过期: ${params.token}`)
        set.status = 410
        return { error: "Download token expired" }
      }

      // 获取文件信息
      const file = await db
        .select()
        .from(files)
        .where(eq(files.id, tokenRecord.fileId))
        .get()

      if (!file) {
        logger.warn(`令牌对应的文件未找到: ${tokenRecord.fileId}`)
        set.status = 404
        return { error: "File not found" }
      }

      // 增加使用次数计数器
      const newUsageCount = usageCount + 1
      await db
        .update(downloadTokens)
        .set({
          usageCount: newUsageCount,
          used: newUsageCount >= maxUsage // 兼容旧字段：达到最大次数时设为true
        })
        .where(eq(downloadTokens.id, tokenRecord.id))

      // 获取存储配置
      const config = await db.select().from(storageConfig).get()
      if (!config) {
        logger.error("存储配置未找到")
        set.status = 500
        return { error: "Storage not configured" }
      }

      logger.file('DOWNLOAD', file.originalName, file.size, true)
      logger.info(`文件下载成功: ${file.originalName} - 用户: ${tokenRecord.userId} - 令牌: ${tokenRecord.id} - 使用次数: ${newUsageCount}/${maxUsage}`)

      const storageService = new StorageService(config)
      
      if (config.storageType === "r2") {
        // 对于R2存储，返回预签名URL进行重定向
        const downloadUrl = await storageService.getDownloadUrl(file.storagePath)
        set.redirect = downloadUrl
        return
      } else {
        // 对于本地存储，直接返回文件流
        const fs = await import("fs")
        const path = await import("path")
        
        if (!fs.existsSync(file.storagePath)) {
          logger.error(`本地文件不存在: ${file.storagePath}`)
          set.status = 404
          return { error: "File not found on storage" }
        }

        const fileBuffer = fs.readFileSync(file.storagePath)
        
        // 设置响应头，避免创建新的Response对象
        set.headers["Content-Type"] = file.mimeType || "application/octet-stream"
        set.headers["Content-Disposition"] = `attachment; filename="${encodeURIComponent(file.originalName)}"`
        set.headers["Content-Length"] = file.size.toString()
        
        // 直接返回Buffer，让Elysia处理响应
        return fileBuffer
      }
    } catch (error) {
      logger.error("文件下载失败:", error)
      set.status = 500
      return { error: "Download failed" }
    }
  })
  // 文件直链访问路由（无需认证，可多次使用）
  .get("/direct/:filename", async ({ params, set }) => {
    try {
      logger.debug(`使用直链访问文件: ${params.filename}`)

      // 查找直链记录
      const linkRecord = await db
        .select()
        .from(fileDirectLinks)
        .where(eq(fileDirectLinks.directName, params.filename))
        .get()

      if (!linkRecord) {
        logger.warn(`直链文件未找到: ${params.filename}`)
        set.status = 404
        return { error: "Direct link not found" }
      }

      // 检查直链是否启用
      if (!linkRecord.enabled) {
        logger.warn(`直链已禁用: ${params.filename}`)
        set.status = 403
        return { error: "Direct link disabled" }
      }

      // 获取文件信息
      const file = await db
        .select()
        .from(files)
        .where(eq(files.id, linkRecord.fileId))
        .get()

      if (!file) {
        logger.warn(`直链对应的文件未找到: ${linkRecord.fileId}`)
        set.status = 404
        return { error: "File not found" }
      }

      // 增加访问计数
      await db
        .update(fileDirectLinks)
        .set({
          accessCount: linkRecord.accessCount + 1,
          updatedAt: Date.now()
        })
        .where(eq(fileDirectLinks.id, linkRecord.id))

      // 获取存储配置
      const config = await db.select().from(storageConfig).get()
      if (!config) {
        logger.error("存储配置未找到")
        set.status = 500
        return { error: "Storage not configured" }
      }

      logger.file('DIRECT_DOWNLOAD', file.originalName, file.size, true)
      logger.info(`文件直链访问: ${file.originalName} - 用户: ${linkRecord.userId} - 访问次数: ${linkRecord.accessCount + 1}`)

      const storageService = new StorageService(config)

      if (config.storageType === "r2") {
        // 对于R2存储，返回预签名URL进行重定向
        const downloadUrl = await storageService.getDownloadUrl(file.storagePath)
        set.redirect = downloadUrl
        return
      } else {
        // 对于本地存储，直接返回文件流
        const fs = await import("fs")
        const path = await import("path")

        if (!fs.existsSync(file.storagePath)) {
          logger.error(`本地文件不存在: ${file.storagePath}`)
          set.status = 404
          return { error: "File not found on storage" }
        }

        const fileBuffer = fs.readFileSync(file.storagePath)

        // 设置响应头，避免创建新的Response对象
        set.headers["Content-Type"] = file.mimeType || "application/octet-stream"
        set.headers["Content-Disposition"] = `attachment; filename="${encodeURIComponent(file.originalName)}"`
        set.headers["Content-Length"] = file.size.toString()

        // 直接返回Buffer，让Elysia处理响应
        return fileBuffer
      }
    } catch (error) {
      logger.error("文件直链访问失败:", error)
      set.status = 500
      return { error: "Direct link access failed" }
    }
  })
