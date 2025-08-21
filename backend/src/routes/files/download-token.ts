import { Elysia } from "elysia"
import { nanoid } from "nanoid"
import { db } from "../../db"
import { files, downloadTokens } from "../../db/schema"
import { and, eq } from "drizzle-orm"
import { logger } from "../../utils/logger"
import { getBaseUrl } from "../../utils/url"

export const downloadTokenRoutes = new Elysia()
	.get("/:id/download", async (ctx) => {
		const { params, set, headers } = ctx as any
		const { user } = ctx as any
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
			const tokenId = nanoid()
			const downloadToken = nanoid(32)
			const expiresAt = Date.now() + 5 * 60 * 1000
			await db.insert(downloadTokens).values({
				id: tokenId,
				fileId: file.id,
				userId: user.userId,
				token: downloadToken,
				used: false,
				usageCount: 0,
				maxUsage: 2,
				expiresAt,
				createdAt: Date.now(),
			})
			logger.info(`生成下载令牌: ${file.originalName} - 用户: ${user.userId} - 令牌: ${tokenId}`)
			const baseUrl = getBaseUrl(headers)
			const downloadUrl = `${baseUrl}/files/download/${downloadToken}`
			return { downloadUrl }
		} catch (error) {
			logger.error("生成下载令牌失败:", error)
			set.status = 500
			return { error: "Download token generation failed" }
		}
	}) 