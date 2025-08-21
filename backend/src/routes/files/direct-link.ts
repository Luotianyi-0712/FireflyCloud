import { Elysia } from "elysia"
import { db } from "../../db"
import { files, fileDirectLinks } from "../../db/schema"
import { and, eq } from "drizzle-orm"
import { nanoid } from "nanoid"
import { getBaseUrl } from "../../utils/url"
import { logger } from "../../utils/logger"

export const directLinkRoutes = new Elysia()
	.get("/:id/direct-link", async (ctx) => {
		const { params, set, headers } = ctx as any
		const { user } = ctx as any
		try {
			logger.debug(`获取文件直链: ${params.id} - 用户: ${user.userId}`)
			const file = await db.select().from(files).where(and(eq(files.id, params.id), eq(files.userId, user.userId))).get()
			if (!file) {
				logger.warn(`文件未找到: ${params.id} - 用户: ${user.userId}`)
				set.status = 404
				return { error: "File not found" }
			}
			let directLink = await db.select().from(fileDirectLinks).where(eq(fileDirectLinks.fileId, file.id)).get()
			if (!directLink) {
				let directName = file.originalName
				let counter = 1
				while (true) {
					const existing = await db.select().from(fileDirectLinks).where(eq(fileDirectLinks.directName, directName)).get()
					if (!existing) break
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
				const linkId = nanoid()
				const token = nanoid(32)
				const now = Date.now()
				await db.insert(fileDirectLinks).values({
					id: linkId,
					fileId: file.id,
					userId: user.userId,
					directName,
					token,
					enabled: true,
					accessCount: 0,
					createdAt: now,
					updatedAt: now,
				})
				directLink = { id: linkId, fileId: file.id, userId: user.userId, directName, token, enabled: true, accessCount: 0, createdAt: now, updatedAt: now } as any
				logger.info(`创建文件直链: ${file.originalName} -> ${directName} - 用户: ${user.userId}`)
			}
			const baseUrl = getBaseUrl(headers)
			const directUrl = `${baseUrl}/dl/${(directLink as any).directName}?token=${(directLink as any).token}`
			return { directUrl, enabled: (directLink as any).enabled, accessCount: (directLink as any).accessCount, createdAt: (directLink as any).createdAt }
		} catch (error) {
			logger.error("获取文件直链失败:", error)
			set.status = 500
			return { error: "Get direct link failed" }
		}
	})
	.put("/:id/direct-link", async (ctx) => {
		const { params, set, body } = ctx as any
		const { user } = ctx as any
		try {
			logger.debug(`更新文件直链状态: ${params.id} - 用户: ${user.userId}`)
			const file = await db.select().from(files).where(and(eq(files.id, params.id), eq(files.userId, user.userId))).get()
			if (!file) {
				logger.warn(`文件未找到: ${params.id} - 用户: ${user.userId}`)
				set.status = 404
				return { error: "File not found" }
			}
			const { enabled } = body as { enabled: boolean }
			await db.update(fileDirectLinks).set({ enabled, updatedAt: Date.now() }).where(and(eq(fileDirectLinks.fileId, file.id), eq(fileDirectLinks.userId, user.userId)))
			logger.info(`更新文件直链状态: ${file.originalName} - 启用: ${enabled} - 用户: ${user.userId}`)
			return { success: true, enabled }
		} catch (error) {
			logger.error("更新文件直链状态失败:", error)
			set.status = 500
			return { error: "Update direct link failed" }
		}
	}) 