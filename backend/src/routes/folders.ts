import { Elysia, t } from "elysia"
import { jwt } from "@elysiajs/jwt"
import { bearer } from "@elysiajs/bearer"
import { nanoid } from "nanoid"
import { db } from "../db"
import { folders, files } from "../db/schema"
import { eq, and, like, isNull } from "drizzle-orm"
import { logger } from "../utils/logger"

export const folderRoutes = new Elysia({ prefix: "/folders" })
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
  // 获取用户的文件夹树结构
  .get("/", async ({ user }) => {
    logger.debug(`获取用户文件夹列表: ${user.userId}`)
    
    const userFolders = await db
      .select()
      .from(folders)
      .where(eq(folders.userId, user.userId))
      .orderBy(folders.path)
    
    logger.info(`用户 ${user.userId} 获取了 ${userFolders.length} 个文件夹`)
    return { folders: userFolders }
  })
  // 获取指定文件夹的内容（子文件夹和文件）
  .get("/:id/contents", async ({ params, user }) => {
    const folderId = params.id === "root" ? null : params.id
    
    logger.debug(`获取文件夹内容: ${folderId || "root"} - 用户: ${user.userId}`)
    
    // 获取子文件夹
    const subFolders = await db
      .select()
      .from(folders)
      .where(
        and(
          eq(folders.userId, user.userId),
          folderId ? eq(folders.parentId, folderId) : isNull(folders.parentId)
        )
      )
      .orderBy(folders.name)
    
    // 获取文件
    const folderFiles = await db
      .select()
      .from(files)
      .where(
        and(
          eq(files.userId, user.userId),
          folderId ? eq(files.folderId, folderId) : isNull(files.folderId)
        )
      )
      .orderBy(files.originalName)
    
    logger.info(`文件夹 ${folderId || "root"} 包含 ${subFolders.length} 个子文件夹和 ${folderFiles.length} 个文件`)
    
    return {
      folders: subFolders,
      files: folderFiles
    }
  })
  // 创建新文件夹
  .post(
    "/",
    async ({ body, user, set }) => {
      try {
        logger.debug(`收到创建文件夹请求，body:`, JSON.stringify(body))
        const { name, parentId } = body

        // 手动验证
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
          set.status = 422
          return { error: "Name is required and must be a non-empty string" }
        }

        if (name.length > 255) {
          set.status = 422
          return { error: "Name must be less than 255 characters" }
        }

        logger.info(`创建文件夹: ${name} - 父文件夹: ${parentId || "root"} - 用户: ${user.userId}`)
        
        // 验证父文件夹是否存在且属于当前用户
        if (parentId) {
          const parentFolder = await db
            .select()
            .from(folders)
            .where(and(eq(folders.id, parentId), eq(folders.userId, user.userId)))
            .get()
          
          if (!parentFolder) {
            logger.warn(`父文件夹不存在: ${parentId} - 用户: ${user.userId}`)
            set.status = 404
            return { error: "Parent folder not found" }
          }
        }
        
        // 检查同级文件夹名称是否重复
        const existingFolder = await db
          .select()
          .from(folders)
          .where(
            and(
              eq(folders.userId, user.userId),
              eq(folders.name, name),
              parentId ? eq(folders.parentId, parentId) : isNull(folders.parentId)
            )
          )
          .get()
        
        if (existingFolder) {
          logger.warn(`文件夹名称已存在: ${name} - 用户: ${user.userId}`)
          set.status = 400
          return { error: "Folder name already exists" }
        }
        
        // 构建文件夹路径
        let folderPath = name
        if (parentId) {
          const parentFolder = await db
            .select()
            .from(folders)
            .where(eq(folders.id, parentId))
            .get()
          
          if (parentFolder) {
            folderPath = `${parentFolder.path}/${name}`
          }
        }
        
        const folderId = nanoid()
        const now = Date.now()
        
        // 创建文件夹
        await db.insert(folders).values({
          id: folderId,
          userId: user.userId,
          name,
          parentId: parentId || null,
          path: folderPath,
          createdAt: now,
          updatedAt: now,
        })
        
        logger.database('INSERT', 'folders')
        logger.info(`文件夹创建成功: ${name} - ID: ${folderId}`)
        
        return {
          message: "Folder created successfully",
          folder: {
            id: folderId,
            name,
            parentId: parentId || null,
            path: folderPath,
            createdAt: now,
            updatedAt: now,
          },
        }
      } catch (error) {
        logger.error("文件夹创建失败:", error)
        if (error instanceof Error) {
          logger.error("错误详情:", error.message)
          logger.error("错误堆栈:", error.stack)
        }
        set.status = 500
        return { error: "Failed to create folder", details: error instanceof Error ? error.message : String(error) }
      }
    },
    {
      body: t.Object({
        name: t.String(),
        parentId: t.Optional(t.String()),
      }),
    },
  )
  // 重命名文件夹
  .put(
    "/:id",
    async ({ params, body, user, set }) => {
      try {
        const { name } = body
        const folderId = params.id
        
        logger.info(`重命名文件夹: ${folderId} -> ${name} - 用户: ${user.userId}`)
        
        // 验证文件夹是否存在且属于当前用户
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
        
        // 检查同级文件夹名称是否重复
        const existingFolder = await db
          .select()
          .from(folders)
          .where(
            and(
              eq(folders.userId, user.userId),
              eq(folders.name, name),
              folder.parentId ? eq(folders.parentId, folder.parentId) : isNull(folders.parentId),
              // 排除当前文件夹
              eq(folders.id, folderId)
            )
          )
          .get()
        
        if (existingFolder && existingFolder.id !== folderId) {
          logger.warn(`文件夹名称已存在: ${name} - 用户: ${user.userId}`)
          set.status = 400
          return { error: "Folder name already exists" }
        }
        
        // 构建新的路径
        const oldPath = folder.path
        let newPath = name
        if (folder.parentId) {
          const parentFolder = await db
            .select()
            .from(folders)
            .where(eq(folders.id, folder.parentId))
            .get()
          
          if (parentFolder) {
            newPath = `${parentFolder.path}/${name}`
          }
        }
        
        const now = Date.now()
        
        // 更新文件夹
        await db
          .update(folders)
          .set({
            name,
            path: newPath,
            updatedAt: now,
          })
          .where(eq(folders.id, folderId))
        
        // 更新所有子文件夹的路径
        const subFolders = await db
          .select()
          .from(folders)
          .where(like(folders.path, `${oldPath}/%`))
        
        for (const subFolder of subFolders) {
          const updatedPath = subFolder.path.replace(oldPath, newPath)
          await db
            .update(folders)
            .set({
              path: updatedPath,
              updatedAt: now,
            })
            .where(eq(folders.id, subFolder.id))
        }
        
        logger.database('UPDATE', 'folders')
        logger.info(`文件夹重命名成功: ${folderId}`)
        
        return {
          message: "Folder renamed successfully",
          folder: {
            ...folder,
            name,
            path: newPath,
            updatedAt: now,
          },
        }
      } catch (error) {
        logger.error("文件夹重命名失败:", error)
        set.status = 500
        return { error: "Failed to rename folder" }
      }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 255 }),
      }),
    },
  )
  // 删除文件夹
  .delete("/:id", async ({ params, user, set }) => {
    try {
      const folderId = params.id
      
      logger.info(`删除文件夹: ${folderId} - 用户: ${user.userId}`)
      
      // 验证文件夹是否存在且属于当前用户
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
      
      // 检查文件夹是否为空（包含子文件夹或文件）
      const subFolders = await db
        .select()
        .from(folders)
        .where(eq(folders.parentId, folderId))
        .limit(1)
      
      const folderFiles = await db
        .select()
        .from(files)
        .where(eq(files.folderId, folderId))
        .limit(1)
      
      if (subFolders.length > 0 || folderFiles.length > 0) {
        logger.warn(`文件夹不为空，无法删除: ${folderId} - 用户: ${user.userId}`)
        set.status = 400
        return { error: "Folder is not empty" }
      }
      
      // 删除文件夹
      await db.delete(folders).where(eq(folders.id, folderId))
      
      logger.database('DELETE', 'folders')
      logger.info(`文件夹删除成功: ${folderId}`)
      
      return { message: "Folder deleted successfully" }
    } catch (error) {
      logger.error("文件夹删除失败:", error)
      set.status = 500
      return { error: "Failed to delete folder" }
    }
  })
