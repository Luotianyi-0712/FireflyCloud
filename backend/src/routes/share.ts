import { Elysia } from "elysia"
import { jwt } from "@elysiajs/jwt"
import { bearer } from "@elysiajs/bearer"
import { db } from "../db"
import { files, storageConfig, fileShares, downloadTokens } from "../db/schema"
import { eq, and } from "drizzle-orm"
import { StorageService } from "../services/storage"
import { nanoid } from "nanoid"
import { logger } from "../utils/logger"

export const shareRoutes = new Elysia({ prefix: "/share" })
  // 获取分享信息（无需认证）
  .get("/:token", async ({ params, set }) => {
    try {
      logger.debug(`获取分享信息: ${params.token}`)

      // 查找分享记录
      const shareRecord = await db
        .select()
        .from(fileShares)
        .where(eq(fileShares.shareToken, params.token))
        .get()

      if (!shareRecord) {
        logger.warn(`分享链接无效: ${params.token}`)
        set.status = 404
        return { error: "Share not found" }
      }

      // 检查分享是否启用
      if (!shareRecord.enabled) {
        logger.warn(`分享已禁用: ${params.token}`)
        set.status = 403
        return { error: "Share disabled" }
      }

      // 检查是否过期
      if (shareRecord.expiresAt && Date.now() > shareRecord.expiresAt) {
        logger.warn(`分享已过期: ${params.token}`)
        set.status = 410
        return { error: "Share expired" }
      }

      // 获取文件信息
      const file = await db
        .select()
        .from(files)
        .where(eq(files.id, shareRecord.fileId))
        .get()

      if (!file) {
        logger.warn(`分享对应的文件未找到: ${shareRecord.fileId}`)
        set.status = 404
        return { error: "File not found" }
      }

      logger.info(`获取分享信息成功: ${file.originalName} - 分享ID: ${shareRecord.id}`)

      return {
        file: {
          id: file.id,
          originalName: file.originalName,
          size: file.size,
          mimeType: file.mimeType,
          createdAt: file.createdAt,
        },
        share: {
          requireLogin: shareRecord.requireLogin,
          hasPickupCode: !!shareRecord.pickupCode,
          accessCount: shareRecord.accessCount,
          createdAt: shareRecord.createdAt,
        }
      }
    } catch (error) {
      logger.error("获取分享信息失败:", error)
      set.status = 500
      return { error: "Get share info failed" }
    }
  })
  // 下载分享文件
  .post("/:token/download", async ({ params, body, set }) => {
    try {
      logger.debug(`下载分享文件: ${params.token}`)

      // 查找分享记录
      const shareRecord = await db
        .select()
        .from(fileShares)
        .where(eq(fileShares.shareToken, params.token))
        .get()

      if (!shareRecord) {
        logger.warn(`分享链接无效: ${params.token}`)
        set.status = 404
        return { error: "Share not found" }
      }

      // 检查分享是否启用
      if (!shareRecord.enabled) {
        logger.warn(`分享已禁用: ${params.token}`)
        set.status = 403
        return { error: "Share disabled" }
      }

      // 检查是否过期
      if (shareRecord.expiresAt && Date.now() > shareRecord.expiresAt) {
        logger.warn(`分享已过期: ${params.token}`)
        set.status = 410
        return { error: "Share expired" }
      }

      // 如果需要取件码，验证取件码
      if (shareRecord.pickupCode) {
        const { pickupCode } = body as { pickupCode?: string }
        if (!pickupCode || pickupCode !== shareRecord.pickupCode) {
          logger.warn(`取件码错误: ${params.token}`)
          set.status = 400
          return { error: "Invalid pickup code" }
        }
      }

      // 获取文件信息
      const file = await db
        .select()
        .from(files)
        .where(eq(files.id, shareRecord.fileId))
        .get()

      if (!file) {
        logger.warn(`分享对应的文件未找到: ${shareRecord.fileId}`)
        set.status = 404
        return { error: "File not found" }
      }

      // 增加访问计数
      await db
        .update(fileShares)
        .set({ 
          accessCount: shareRecord.accessCount + 1,
          updatedAt: Date.now()
        })
        .where(eq(fileShares.id, shareRecord.id))

      // 生成一次性下载令牌
      const tokenId = nanoid()
      const downloadToken = nanoid(32)
      const expiresAt = Date.now() + 5 * 60 * 1000 // 5分钟过期

      await db.insert(downloadTokens).values({
        id: tokenId,
        fileId: file.id,
        userId: shareRecord.userId,
        token: downloadToken,
        used: false,
        expiresAt,
        createdAt: Date.now(),
      })

      logger.info(`生成分享文件下载令牌: ${file.originalName} - 分享ID: ${shareRecord.id}`)

      // 返回下载URL
      const downloadUrl = `${process.env.BACKEND_URL || "http://localhost:8080"}/files/download/${downloadToken}`
      
      return { downloadUrl }
    } catch (error) {
      logger.error("下载分享文件失败:", error)
      set.status = 500
      return { error: "Download share failed" }
    }
  })
