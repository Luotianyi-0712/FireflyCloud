import { Elysia, t } from "elysia"
import { nanoid } from "nanoid"
import { db } from "../../db"
import { files, folders, r2MountPoints, storageConfig } from "../../db/schema"
import { and, eq } from "drizzle-orm"
import { StorageService } from "../../services/storage"
import { QuotaService } from "../../services/quota"
import { logger } from "../../utils/logger"

export const uploadRoutes = new Elysia()
	.post(
		"/upload",
		async (ctx) => {
			const { body, set } = ctx as any
			const { user } = ctx as any
			try {
				const { file, folderId, currentR2Path } = body as any
				if (!file || !(file instanceof File)) {
					logger.warn(`文件上传失败: 用户 ${user.userId} 未提供文件`)
					set.status = 400
					return { error: "No file provided" }
				}

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

				const config = await db.select().from(storageConfig).get()
				if (!config) {
					logger.error("存储配置未找到")
					set.status = 500
					return { error: "Storage not configured" }
				}

				let targetStorageType = config.storageType
				let r2MountPoint: any = null
				if (folderId) {
					let currentFolderId: string | null | undefined = folderId
					while (currentFolderId) {
						const mountPoint = await db
							.select()
							.from(r2MountPoints)
							.where(and(
								eq(r2MountPoints.folderId, currentFolderId),
								eq(r2MountPoints.userId, user.userId),
								eq(r2MountPoints.enabled, true)
							))
							.get()
						if (mountPoint) {
							r2MountPoint = mountPoint
							targetStorageType = "r2"
							logger.info(`发现R2挂载点: ${mountPoint.mountName} -> ${mountPoint.r2Path}`)
							break
						}
						const parentFolder = await db
							.select({ parentId: folders.parentId })
							.from(folders)
							.where(eq(folders.id, currentFolderId))
							.get()
						currentFolderId = parentFolder?.parentId
					}
				}

				const quotaCheck = await QuotaService.checkUserQuota(user.userId, file.size)
				if (!quotaCheck.allowed) {
					logger.warn(`用户 ${user.userId} 配额不足: 需要 ${file.size} 字节, 可用 ${quotaCheck.availableSpace} 字节`)
					set.status = 413
					return { error: "Storage quota exceeded", details: {
						fileSize: file.size,
						currentUsed: quotaCheck.currentUsed,
						maxStorage: quotaCheck.maxStorage,
						availableSpace: quotaCheck.availableSpace
					}}
				}

				const storageService = new StorageService(config)
				const fileId = nanoid()
				const filename = `${fileId}-${file.name}`

				let storagePath: string
				if (targetStorageType === "r2" && r2MountPoint) {
					let targetR2Path = currentR2Path || r2MountPoint.r2Path
					const fullR2Path = targetR2Path ? `${targetR2Path}/${filename}` : filename
					const r2Config = { ...config, storageType: "r2" as const }
					const r2StorageService = new StorageService(r2Config)
					storagePath = await r2StorageService.uploadToR2Direct(file, fullR2Path)
					logger.info(`文件上传到R2挂载点: ${r2MountPoint.mountName} -> ${fullR2Path}`)
					logger.info(`当前R2路径: ${currentR2Path || '未指定，使用挂载点路径'}`)
				} else {
					storagePath = await storageService.uploadFile(file, filename)
				}
				logger.file('UPLOAD', file.name, file.size, true)

				await QuotaService.updateUserStorage(user.userId, file.size)

				await db.insert(files).values({
					id: fileId,
					userId: user.userId,
					folderId: folderId || null,
					filename,
					originalName: file.name,
					size: file.size,
					mimeType: file.type,
					storageType: targetStorageType,
					storagePath,
					createdAt: Date.now(),
				})

				return { message: "File uploaded successfully", file: {
					id: fileId,
					filename,
					originalName: file.name,
					size: file.size,
					mimeType: file.type,
					folderId: folderId || null,
				}}
			} catch (error) {
				logger.error("文件上传失败:", error)
				logger.file('UPLOAD', (body as any)?.file?.name || 'unknown', (body as any)?.file?.size, false, error instanceof Error ? error : undefined)
				set.status = 500
				return { error: "Upload failed" }
			}
		},
		{
			body: t.Object({
				file: t.File(),
				folderId: t.Optional(t.String()),
				currentR2Path: t.Optional(t.String()),
			}),
		}
	) 