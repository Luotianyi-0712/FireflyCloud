import { Elysia, t } from "elysia"
import { jwt } from "@elysiajs/jwt"
import { bearer } from "@elysiajs/bearer"
import { nanoid } from "nanoid"
import { db } from "../db"
import { files, storageConfig } from "../db/schema"
import { eq, and } from "drizzle-orm"
import { StorageService } from "../services/storage"

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

    return { user: payload }
  })
  .get("/", async ({ user }) => {
    const userFiles = await db.select().from(files).where(eq(files.userId, user.userId))
    return { files: userFiles }
  })
  .post(
    "/upload",
    async ({ body, user, set }) => {
      try {
        const { file } = body

        if (!file || !(file instanceof File)) {
          set.status = 400
          return { error: "No file provided" }
        }

        // Get storage config
        const config = await db.select().from(storageConfig).get()
        if (!config) {
          set.status = 500
          return { error: "Storage not configured" }
        }

        const storageService = new StorageService(config)
        const fileId = nanoid()
        const filename = `${fileId}-${file.name}`

        // Upload file
        const storagePath = await storageService.uploadFile(file, filename)

        // Save to database
        await db.insert(files).values({
          id: fileId,
          userId: user.userId,
          filename,
          originalName: file.name,
          size: file.size,
          mimeType: file.type,
          storageType: config.storageType,
          storagePath,
          createdAt: Date.now(),
        })

        return {
          message: "File uploaded successfully",
          file: {
            id: fileId,
            filename,
            originalName: file.name,
            size: file.size,
            mimeType: file.type,
          },
        }
      } catch (error) {
        set.status = 500
        return { error: "Upload failed" }
      }
    },
    {
      body: t.Object({
        file: t.File(),
      }),
    },
  )
  .get("/:id/download", async ({ params, user, set }) => {
    try {
      const file = await db
        .select()
        .from(files)
        .where(and(eq(files.id, params.id), eq(files.userId, user.userId)))
        .get()

      if (!file) {
        set.status = 404
        return { error: "File not found" }
      }

      const config = await db.select().from(storageConfig).get()
      if (!config) {
        set.status = 500
        return { error: "Storage not configured" }
      }

      const storageService = new StorageService(config)
      const downloadUrl = await storageService.getDownloadUrl(file.storagePath)

      return { downloadUrl }
    } catch (error) {
      set.status = 500
      return { error: "Download failed" }
    }
  })
  .delete("/:id", async ({ params, user, set }) => {
    try {
      const file = await db
        .select()
        .from(files)
        .where(and(eq(files.id, params.id), eq(files.userId, user.userId)))
        .get()

      if (!file) {
        set.status = 404
        return { error: "File not found" }
      }

      const config = await db.select().from(storageConfig).get()
      if (!config) {
        set.status = 500
        return { error: "Storage not configured" }
      }

      const storageService = new StorageService(config)
      await storageService.deleteFile(file.storagePath)

      await db.delete(files).where(eq(files.id, params.id))

      return { message: "File deleted successfully" }
    } catch (error) {
      set.status = 500
      return { error: "Delete failed" }
    }
  })
