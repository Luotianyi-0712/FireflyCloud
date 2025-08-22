import { Elysia, t } from "elysia"
import { db } from "../../db"
import { files, folders, storageConfig, oneDriveAuth, users } from "../../db/schema"
import { and, eq } from "drizzle-orm"
import { logger } from "../../utils/logger"
import { OneDriveService } from "../../services/onedrive"
import { nanoid } from "nanoid"
import { QuotaService } from "../../services/quota"

function resolveOneDriveSecretConfig(cfg: any) {
	return {
		clientId: cfg.oneDriveClientId || cfg.clientId,
		clientSecret: cfg.oneDriveClientSecret || cfg.clientSecret,
		tenantId: cfg.oneDriveTenantId || cfg.tenantId,
	}
}

async function getAdminAccessToken(cfg: any): Promise<string> {
	const od = resolveOneDriveSecretConfig(cfg)
	const service = new OneDriveService({ clientId: od.clientId, clientSecret: od.clientSecret, tenantId: od.tenantId })
	// 获取管理员 OneDrive 认证
	const admin = await db
		.select({ id: oneDriveAuth.id, accessToken: oneDriveAuth.accessToken, refreshToken: oneDriveAuth.refreshToken, expiresAt: oneDriveAuth.expiresAt })
		.from(oneDriveAuth)
		.innerJoin(users, eq(oneDriveAuth.userId, users.id))
		.where(eq(users.role, 'admin'))
		.get()
	if (!admin) throw new Error("管理员OneDrive认证信息未找到")
	let accessToken = admin.accessToken
	if (admin.expiresAt <= Date.now()) {
		logger.warn(`管理员OneDrive访问令牌已过期，开始自动刷新`)
		const refreshed = await service.refreshToken(admin.refreshToken)
		await db.update(oneDriveAuth).set({ accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken, expiresAt: refreshed.expiresAt, updatedAt: Date.now() }).where(eq(oneDriveAuth.id, admin.id))
		accessToken = refreshed.accessToken
		logger.info(`管理员OneDrive访问令牌刷新成功`)
	}
	return accessToken
}

export const onedriveDirectUploadRoutes = new Elysia()
	.post(
		"/onedrive/create-upload-session",
		async (ctx) => {
			const { body, set } = ctx as any
			const { user } = ctx as any
			try {
				const { filename, folderId, currentOneDrivePath } = body as { filename: string; folderId?: string; currentOneDrivePath?: string }
				if (!filename) {
					set.status = 400
					return { error: "filename is required" }
				}

				// 加载存储配置
				const cfg = await db.select().from(storageConfig).get()
				if (!cfg) {
					set.status = 500
					return { error: "Storage not configured" }
				}
				// 仅支持 OneDrive 直传
				if (!(cfg.storageType === 'onedrive' || cfg.enableMixedMode)) {
					set.status = 400
					return { error: "OneDrive direct upload not enabled" }
				}

				// 获取管理员访问令牌
				const accessToken = await getAdminAccessToken(cfg)
				const od = resolveOneDriveSecretConfig(cfg)
				const service = new OneDriveService({ clientId: od.clientId, clientSecret: od.clientSecret, tenantId: od.tenantId })
				service.setAccessToken(accessToken)

				// 计算用户在 OneDrive 的目标文件夹路径
				let targetFolder = ''
				if (currentOneDrivePath && typeof currentOneDrivePath === 'string' && currentOneDrivePath.length > 0) {
					targetFolder = currentOneDrivePath.startsWith('/') ? currentOneDrivePath : `/${currentOneDrivePath}`
				} else {
					// 退化到统一的 users/ 目录（与服务端上传一致）
					const userRecord = await db.select().from(users).where(eq(users.id, user.userId)).get()
					const email = userRecord?.email || user.email || 'user'
					const normalized = `users/${email.replace('@', '_at_')}_${user.userId.slice(-8)}`
					targetFolder = `/${normalized}`
				}

				// 确保文件夹存在
				await service.ensureFolderExists(targetFolder)
				// 创建上传会话
				const session = await service.createUploadSession(targetFolder, filename)

				return { useDirect: true, uploadUrl: session.uploadUrl, targetFolder }
			} catch (error) {
				logger.error("创建 OneDrive 直传会话失败:", error)
				set.status = 500
				return { error: "Failed to create OneDrive upload session" }
			}
		},
		{
			body: t.Object({
				filename: t.String(),
				folderId: t.Optional(t.String()),
				currentOneDrivePath: t.Optional(t.String()),
			}),
		}
	)
	.post(
		"/onedrive/finalize-upload",
		async (ctx) => {
			const { body, set } = ctx as any
			const { user } = ctx as any
			try {
				const { filename, size, mimeType, driveItemId, folderId } = body as { filename: string; size: number; mimeType: string; driveItemId: string; folderId?: string }
				if (!filename || !size || !mimeType || !driveItemId) {
					set.status = 400
					return { error: "missing fields" }
				}

				// 验证可选的文件夹归属
				if (folderId) {
					const folder = await db.select().from(folders).where(and(eq(folders.id, folderId), eq(folders.userId, user.userId))).get()
					if (!folder) {
						set.status = 404
						return { error: "Folder not found" }
					}
				}

				const id = nanoid()
				await db.insert(files).values({
					id,
					userId: user.userId,
					folderId: folderId || null,
					filename: filename,
					originalName: filename,
					size,
					mimeType,
					storageType: 'onedrive',
					storagePath: driveItemId,
					createdAt: Date.now(),
				})

				await QuotaService.updateUserStorage(user.userId, size)

				logger.file('UPLOAD', filename, size, true)
				return { success: true, file: { id, filename, originalName: filename, size, mimeType, folderId: folderId || null } }
			} catch (error) {
				logger.error("OneDrive 直传登记失败:", error)
				set.status = 500
				return { error: "Failed to finalize OneDrive upload" }
			}
		},
		{
			body: t.Object({
				filename: t.String(),
				size: t.Number(),
				mimeType: t.String(),
				driveItemId: t.String(),
				folderId: t.Optional(t.String()),
			}),
		}
	) 