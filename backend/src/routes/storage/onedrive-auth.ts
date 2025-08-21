import { Elysia, t } from "elysia"
import { db } from "../../db"
import { storageConfig, oneDriveAuth } from "../../db/schema"
import { logger } from "../../utils/logger"
import { eq } from "drizzle-orm"
import { OneDriveService } from "../../services/onedrive"

export const onedriveAuthRoutes = new Elysia()
	.get("/onedrive/auth-url", async (ctx) => {
		const { query, set } = ctx as any
		try {
			const { redirectUri } = query as { redirectUri?: string }
			if (!redirectUri) {
				set.status = 400
				return { error: "Missing redirectUri parameter" }
			}
			logger.debug(`获取OneDrive认证URL: ${redirectUri}`)
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
	}, { query: t.Object({ redirectUri: t.String() }) })
	.post("/onedrive/callback", async (ctx) => {
		const { body, user, set } = ctx as any
		try {
			const { code, redirectUri } = body
			logger.info(`处理OneDrive认证回调: 用户 ${user.userId}`)
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
			const tokenData = await oneDriveService.getTokenFromCode(code, redirectUri)
			const existingAuth = await db
				.select()
				.from(oneDriveAuth)
				.where(eq(oneDriveAuth.userId, user.userId))
				.get()
			const authId = existingAuth?.id || crypto.randomUUID?.() || `${Date.now()}`
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
	}, { body: t.Object({ code: t.String(), redirectUri: t.String() }) })
	.get("/onedrive/status", async (ctx) => {
		const { user } = ctx as any
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
			const isExpired = auth.expiresAt <= Date.now()
			return { connected: !isExpired, authenticated: !isExpired, expiresAt: auth.expiresAt, scope: auth.scope }
		} catch (error) {
			logger.error("检查OneDrive认证状态失败:", error)
			return { authenticated: false }
		}
	}) 