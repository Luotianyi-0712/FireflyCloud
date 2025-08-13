import { Elysia } from "elysia"
import { jwt } from "@elysiajs/jwt"
import { bearer } from "@elysiajs/bearer"
import { db } from "../db"
import { users, files } from "../db/schema"
import { eq } from "drizzle-orm"

export const adminRoutes = new Elysia({ prefix: "/admin" })
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
    if (!payload || payload.role !== "admin") {
      set.status = 403
      throw new Error("Admin access required")
    }

    return { user: payload }
  })
  .get("/stats", async () => {
    const totalUsers = await db.select().from(users).all()
    const totalFiles = await db.select().from(files).all()

    const totalStorage = totalFiles.reduce((sum, file) => sum + file.size, 0)

    return {
      totalUsers: totalUsers.length,
      totalFiles: totalFiles.length,
      totalStorage,
      adminUsers: totalUsers.filter((u) => u.role === "admin").length,
      regularUsers: totalUsers.filter((u) => u.role === "user").length,
    }
  })
  .get("/users", async () => {
    const allUsers = await db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)

    return { users: allUsers }
  })
  .get("/files", async () => {
    const allFiles = await db.select().from(files).all()
    return { files: allFiles }
  })
  .delete("/users/:id", async ({ params, set }) => {
    try {
      if (params.id === "admin") {
        set.status = 400
        return { error: "Cannot delete admin user" }
      }

      // Delete user's files first
      await db.delete(files).where(eq(files.userId, params.id))

      // Delete user
      await db.delete(users).where(eq(users.id, params.id))

      return { message: "User deleted successfully" }
    } catch (error) {
      set.status = 500
      return { error: "Delete failed" }
    }
  })
  .delete("/files/:id", async ({ params, set }) => {
    try {
      await db.delete(files).where(eq(files.id, params.id))
      return { message: "File deleted successfully" }
    } catch (error) {
      set.status = 500
      return { error: "Delete failed" }
    }
  })
