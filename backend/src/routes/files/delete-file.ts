import { Elysia } from "elysia"
import { db } from "../../db"
import { files, storageConfig } from "../../db/schema"
import { and, eq } from "drizzle-orm"
import { StorageService } from "../../services/storage"
import { QuotaService } from "../../services/quota"
import { logger } from "../../utils/logger"

export const deleteFileRoutes = new Elysia()
	.delete("/:id", async (ctx) => {
		const { params, set } = ctx as any
		const { user } = ctx as any
		try {
			logger.debug(`请求删除文件: ${params.id} - 用户: ${user.userId}`)
			const file = await db.select().from(files).where(and(eq(files.id, params.id), eq(files.userId, user.userId))).get()
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
			await QuotaService.updateUserStorage(user.userId, -file.size)
			await db.delete(files).where(eq(files.id, params.id))
			logger.database('DELETE', 'files')
			logger.info(`文件删除成功: ${file.originalName} - 用户: ${user.userId}`)
			return { message: "File deleted successfully" }
		} catch (error) {
			logger.error("文件删除失败:", error)
			logger.file('DELETE', 'unknown', 0, false, error instanceof Error ? error : undefined)
			set.status = 500
			return { error: "Delete failed" }
		}
	}) 