import { Elysia, t } from "elysia"
import { jwt } from "@elysiajs/jwt"
import { bearer } from "@elysiajs/bearer"
import { nanoid } from "nanoid"
import { db } from "../db"
import { files, storageConfig, folders, downloadTokens, fileDirectLinks, fileShares } from "../db/schema"
import { eq, and, isNull } from "drizzle-orm"
import { StorageService } from "../services/storage"
import { QuotaService } from "../services/quota"
import { logger } from "../utils/logger"
import { getBaseUrl, getFrontendUrl } from "../utils/url"
import * as fs from "fs"
import * as path from "path"

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

    return { user: payload as { userId: string; email: string; role: string } }
  })
  .get("/", async ({ user, query }) => {
    logger.debug(`获取用户文件列表: ${user.userId}`)

    // 构建查询条件
    let whereConditions = [eq(files.userId, user.userId)]

    // 如果指定了文件夹ID，添加文件夹过滤条件
    if (query.folderId !== undefined) {
      const folderId = query.folderId === "root" ? null : query.folderId
      whereConditions.push(
        folderId ? eq(files.folderId, folderId) : isNull(files.folderId)
      )
    }

    const userFiles = await db
      .select()
      .from(files)
      .where(and(...whereConditions))
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

        // 检查用户配额
        const quotaCheck = await QuotaService.checkUserQuota(user.userId, file.size)
        if (!quotaCheck.allowed) {
          logger.warn(`用户 ${user.userId} 配额不足: 需要 ${file.size} 字节, 可用 ${quotaCheck.availableSpace} 字节`)
          set.status = 413 // Payload Too Large
          return {
            error: "Storage quota exceeded",
            details: {
              fileSize: file.size,
              currentUsed: quotaCheck.currentUsed,
              maxStorage: quotaCheck.maxStorage,
              availableSpace: quotaCheck.availableSpace
            }
          }
        }

        const storageService = new StorageService(config)
        const fileId = nanoid()
        const filename = `${fileId}-${file.name}`

        // Upload file
        const storagePath = await storageService.uploadFile(file, filename)
        logger.file('UPLOAD', file.name, file.size, true)

        // 更新用户存储使用量
        await QuotaService.updateUserStorage(user.userId, file.size)

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
        logger.file('UPLOAD', body?.file?.name || 'unknown', body?.file?.size, false, error instanceof Error ? error : undefined)
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
  .get("/:id/download", async ({ params, user, set, headers }) => {
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
        usageCount: 0, // 初始使用次数为0
        maxUsage: 2,   // 允许使用2次
        expiresAt,
        createdAt: Date.now(),
      })

      logger.info(`生成下载令牌: ${file.originalName} - 用户: ${user.userId} - 令牌: ${tokenId}`)

      // 返回下载URL，包含令牌 - 自动获取域名
      const baseUrl = getBaseUrl(headers)
      const downloadUrl = `${baseUrl}/files/download/${downloadToken}`

      return { downloadUrl }
    } catch (error) {
      logger.error("生成下载令牌失败:", error)
      set.status = 500
      return { error: "Download token generation failed" }
    }
  })
  // 获取文件内容（用于文本文件预览和编辑）
  .get("/:id/content", async ({ params, user, set }) => {
    try {
      logger.debug(`获取文件内容: ${params.id} - 用户: ${user.userId}`)

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

      logger.debug(`文件信息: ${file.originalName}, MIME: ${file.mimeType}, 存储路径: ${file.storagePath}`)

      // 检查是否为文本文件 - 优先基于文件扩展名检测
      const ext = file.originalName.split('.').pop()?.toLowerCase() || ''
      const textExtensions = ['txt', 'md', 'json', 'js', 'ts', 'tsx', 'jsx', 'css', 'scss', 'sass', 'less', 'html', 'htm', 'xml', 'yaml', 'yml', 'ini', 'conf', 'config', 'log', 'sql', 'py', 'java', 'cpp', 'c', 'h', 'cs', 'php', 'rb', 'go', 'rs', 'sh', 'bash', 'bat', 'ps1', 'vue', 'svelte', 'astro', 'dockerfile', 'gitignore', 'env', 'toml', 'lock', 'makefile', 'cmake', 'gradle', 'properties', 'cfg', 'rc']
      
      const isTextFile = textExtensions.includes(ext) || 
        file.mimeType.startsWith("text/") || 
        file.mimeType === "application/json" ||
        file.mimeType === "application/javascript" ||
        file.mimeType === "application/xml"

      logger.debug(`文件扩展名: ${ext}, 是否为文本文件: ${isTextFile}`)

      if (!isTextFile) {
        set.status = 400
        return { error: "File is not a text file" }
      }

      const config = await db.select().from(storageConfig).get()
      if (!config) {
        logger.error("存储配置未找到")
        set.status = 500
        return { error: "Storage not configured" }
      }

      try {
        // 读取文件内容
        const storageService = new StorageService(config)
        let content = ""

        if (config.storageType === "local") {
          // 本地存储直接读取文件
          // 检查 storagePath 是否已经是绝对路径
          const filePath = path.isAbsolute(file.storagePath) 
            ? file.storagePath 
            : path.join(process.cwd(), "uploads", file.storagePath)
          logger.debug(`尝试读取本地文件: ${filePath}`)
          
          if (fs.existsSync(filePath)) {
            content = fs.readFileSync(filePath, "utf8")
            logger.debug(`成功读取文件内容，长度: ${content.length} 字符`)
          } else {
            logger.error(`本地文件不存在: ${filePath}`)
            set.status = 404
            return { error: "File not found on storage" }
          }
        } else {
          // 云存储需要下载文件内容
          logger.debug(`尝试从云存储下载文件: ${file.storagePath}`)
          const fileBuffer = await storageService.downloadFile(file.storagePath)
          content = fileBuffer.toString("utf8")
          logger.debug(`成功从云存储读取文件内容，长度: ${content.length} 字符`)
        }

        logger.info(`获取文件内容成功: ${file.originalName} - 用户: ${user.userId}, 内容长度: ${content.length}`)
        
        // 直接返回文本内容，设置正确的Content-Type
        set.headers["Content-Type"] = "text/plain; charset=utf-8"
        return content
      } catch (error) {
        logger.error("读取文件内容失败:", error)
        set.status = 500
        return { error: "Failed to read file content" }
      }
    } catch (error) {
      logger.error("获取文件内容失败:", error)
      set.status = 500
      return { error: "Get file content failed" }
    }
  })
  // 保存文件内容（用于文本文件编辑）
  .put("/:id/content", async ({ params, user, set, body }) => {
    try {
      logger.debug(`保存文件内容: ${params.id} - 用户: ${user.userId}`)

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

      // 检查是否为文本文件 - 优先基于文件扩展名检测
      const ext = file.originalName.split('.').pop()?.toLowerCase() || ''
      const textExtensions = ['txt', 'md', 'json', 'js', 'ts', 'tsx', 'jsx', 'css', 'scss', 'sass', 'less', 'html', 'htm', 'xml', 'yaml', 'yml', 'ini', 'conf', 'config', 'log', 'sql', 'py', 'java', 'cpp', 'c', 'h', 'cs', 'php', 'rb', 'go', 'rs', 'sh', 'bash', 'bat', 'ps1', 'vue', 'svelte', 'astro', 'dockerfile', 'gitignore', 'env', 'toml', 'lock', 'makefile', 'cmake', 'gradle', 'properties', 'cfg', 'rc']
      
      const isTextFile = textExtensions.includes(ext) || 
        file.mimeType.startsWith("text/") || 
        file.mimeType === "application/json" ||
        file.mimeType === "application/javascript" ||
        file.mimeType === "application/xml"

      if (!isTextFile) {
        set.status = 400
        return { error: "File is not a text file" }
      }

      const config = await db.select().from(storageConfig).get()
      if (!config) {
        logger.error("存储配置未找到")
        set.status = 500
        return { error: "Storage not configured" }
      }

      try {
        const content = typeof body === 'string' ? body : String(body)
        const contentBuffer = Buffer.from(content, 'utf8')
        
        // 保存文件内容
        const storageService = new StorageService(config)

        if (config.storageType === "local") {
          // 本地存储直接写入文件
          const filePath = path.join(process.cwd(), "uploads", file.storagePath)
          const dir = path.dirname(filePath)

          // 确保目录存在
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
          }

          fs.writeFileSync(filePath, content, "utf8")
        } else {
          // R2存储需要重新上传文件
          // 创建一个兼容的文件对象（服务端环境）
          const fileObject = {
            name: file.originalName,
            type: file.mimeType,
            size: contentBuffer.length,
            lastModified: Date.now(),
            arrayBuffer: async () => contentBuffer.buffer.slice(contentBuffer.byteOffset, contentBuffer.byteOffset + contentBuffer.byteLength),
            stream: () => new ReadableStream({
              start(controller) {
                controller.enqueue(contentBuffer)
                controller.close()
              }
            }),
            text: async () => content
          } as File

          await storageService.uploadFile(fileObject, file.storagePath)
        }

        // 更新文件大小
        const newSize = Buffer.byteLength(content, 'utf8')
        const oldSize = file.size
        const sizeChange = newSize - oldSize

        await db
          .update(files)
          .set({
            size: newSize,
            createdAt: Date.now() // 更新修改时间
          })
          .where(eq(files.id, params.id))

        // 如果文件大小发生变化，更新用户配额
        if (sizeChange !== 0) {
          await QuotaService.updateUserStorage(user.userId, sizeChange)
          logger.info(`文件大小变化，更新配额: ${user.userId} - 变化: ${sizeChange} 字节`)
        }

        logger.info(`保存文件内容成功: ${file.originalName} - 用户: ${user.userId} - 大小: ${oldSize} -> ${newSize}`)

        return {
          success: true,
          size: newSize,
          message: "File content saved successfully"
        }
      } catch (error) {
        logger.error("保存文件内容失败:", error)
        set.status = 500
        return { error: "Failed to save file content" }
      }
    } catch (error) {
      logger.error("保存文件内容失败:", error)
      set.status = 500
      return { error: "Save file content failed" }
    }
  })
  // 获取文件直链
  .get("/:id/direct-link", async ({ params, user, set, headers }) => {
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

      // 自动获取域名生成直链URL
      const baseUrl = getBaseUrl(headers)
      const directUrl = `${baseUrl}/files/direct/${directLink.directName}`

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
  .post("/:id/share", async ({ params, user, body, set, headers }) => {
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

      const { requireLogin, usePickupCode, expiresAt, gatekeeper } = body as {
        requireLogin: boolean
        usePickupCode: boolean
        expiresAt: number | null
        gatekeeper?: boolean
      }

      const shareId = nanoid()
      const now = Date.now()

      if (usePickupCode) {
        // 使用取件码模式：只生成取件码，不生成分享链接
        const pickupCode = Math.floor(100000 + Math.random() * 900000).toString()

        await db.insert(fileShares).values({
          id: shareId,
          fileId: file.id,
          userId: user.userId,
          shareToken: null, // 取件码模式不生成分享token
          pickupCode,
          requireLogin,
          enabled: true,
          accessCount: 0,
          expiresAt: expiresAt,
          createdAt: now,
          updatedAt: now,
          gatekeeper: gatekeeper || false,
        })

        logger.info(`创建文件取件码: ${file.originalName} - 用户: ${user.userId} - 取件码: ${pickupCode}`)

        return {
          pickupCode,
          requireLogin,
          expiresAt: expiresAt,
          createdAt: now,
          usePickupCode: true
        }
      } else {
        // 分享链接模式：只生成分享链接，不生成取件码
        const shareToken = nanoid(32)

        await db.insert(fileShares).values({
          id: shareId,
          fileId: file.id,
          userId: user.userId,
          shareToken,
          pickupCode: null, // 分享链接模式不生成取件码
          requireLogin,
          enabled: true,
          accessCount: 0,
          expiresAt: expiresAt,
          createdAt: now,
          updatedAt: now,
          gatekeeper: gatekeeper || false,
        })

        // 自动获取前端域名生成分享URL
        const frontendUrl = getFrontendUrl(headers)
        const shareUrl = `${frontendUrl}/share/${shareToken}`

        logger.info(`创建文件分享链接: ${file.originalName} - 用户: ${user.userId} - 分享ID: ${shareId}`)

        return {
          shareUrl,
          shareToken,
          requireLogin,
          expiresAt: expiresAt,
          createdAt: now,
          usePickupCode: false
        }
      }
    } catch (error) {
      logger.error("创建文件分享失败:", error)
      set.status = 500
      return { error: "Create share failed" }
    }
  })
  // 获取用户的分享列表
  .get("/shares", async ({ user, set }) => {
    try {
      logger.debug(`获取用户分享列表: ${user.userId}`)

      // 获取用户的所有分享记录，包含文件信息
      const userShares = await db
        .select({
          id: fileShares.id,
          fileId: fileShares.fileId,
          shareToken: fileShares.shareToken,
          pickupCode: fileShares.pickupCode,
          requireLogin: fileShares.requireLogin,
          enabled: fileShares.enabled,
          accessCount: fileShares.accessCount,
          expiresAt: fileShares.expiresAt,
          createdAt: fileShares.createdAt,
          updatedAt: fileShares.updatedAt,
          gatekeeper: fileShares.gatekeeper,
          fileName: files.originalName,
          fileSize: files.size,
          fileMimeType: files.mimeType,
        })
        .from(fileShares)
        .innerJoin(files, eq(fileShares.fileId, files.id))
        .where(eq(fileShares.userId, user.userId))
        .orderBy(fileShares.createdAt)

      logger.info(`用户 ${user.userId} 获取了 ${userShares.length} 个分享记录`)

      return { shares: userShares }
    } catch (error) {
      logger.error("获取用户分享列表失败:", error)
      set.status = 500
      return { error: "Get shares failed" }
    }
  })
  // 更新分享状态（启用/禁用）
  .put("/shares/:shareId/status", async ({ params, user, body, set }) => {
    try {
      logger.debug(`更新分享状态: ${params.shareId} - 用户: ${user.userId}`)

      const { enabled } = body as { enabled: boolean }

      // 检查分享是否属于当前用户
      const shareRecord = await db
        .select()
        .from(fileShares)
        .where(and(eq(fileShares.id, params.shareId), eq(fileShares.userId, user.userId)))
        .get()

      if (!shareRecord) {
        logger.warn(`分享记录未找到: ${params.shareId} - 用户: ${user.userId}`)
        set.status = 404
        return { error: "Share not found" }
      }

      // 更新分享状态
      await db
        .update(fileShares)
        .set({
          enabled,
          updatedAt: Date.now()
        })
        .where(eq(fileShares.id, params.shareId))

      logger.info(`更新分享状态: ${params.shareId} - 启用: ${enabled} - 用户: ${user.userId}`)

      return { success: true, enabled }
    } catch (error) {
      logger.error("更新分享状态失败:", error)
      set.status = 500
      return { error: "Update share status failed" }
    }
  })
  // 更新分享有效期
  .put("/shares/:shareId/expiry", async ({ params, user, body, set }) => {
    try {
      logger.debug(`更新分享有效期: ${params.shareId} - 用户: ${user.userId}`)

      const { expiresAt } = body as { expiresAt: number | null }

      // 检查分享是否属于当前用户
      const shareRecord = await db
        .select()
        .from(fileShares)
        .where(and(eq(fileShares.id, params.shareId), eq(fileShares.userId, user.userId)))
        .get()

      if (!shareRecord) {
        logger.warn(`分享记录未找到: ${params.shareId} - 用户: ${user.userId}`)
        set.status = 404
        return { error: "Share not found" }
      }

      // 更新分享有效期
      await db
        .update(fileShares)
        .set({
          expiresAt,
          updatedAt: Date.now()
        })
        .where(eq(fileShares.id, params.shareId))

      logger.info(`更新分享有效期: ${params.shareId} - 有效期: ${expiresAt} - 用户: ${user.userId}`)

      return { success: true, expiresAt }
    } catch (error) {
      logger.error("更新分享有效期失败:", error)
      set.status = 500
      return { error: "Update share expiry failed" }
    }
  })
  // 删除分享
  .delete("/shares/:shareId", async ({ params, user, set }) => {
    try {
      logger.debug(`删除分享: ${params.shareId} - 用户: ${user.userId}`)

      // 检查分享是否属于当前用户
      const shareRecord = await db
        .select()
        .from(fileShares)
        .where(and(eq(fileShares.id, params.shareId), eq(fileShares.userId, user.userId)))
        .get()

      if (!shareRecord) {
        logger.warn(`分享记录未找到: ${params.shareId} - 用户: ${user.userId}`)
        set.status = 404
        return { error: "Share not found" }
      }

      // 删除分享记录
      await db
        .delete(fileShares)
        .where(eq(fileShares.id, params.shareId))

      logger.info(`删除分享: ${params.shareId} - 用户: ${user.userId}`)

      return { success: true }
    } catch (error) {
      logger.error("删除分享失败:", error)
      set.status = 500
      return { error: "Delete share failed" }
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

      // 更新用户存储使用量（减少文件大小）
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
