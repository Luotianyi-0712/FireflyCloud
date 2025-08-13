#!/usr/bin/env bun

import { drizzle } from "drizzle-orm/bun-sqlite"
import { Database } from "bun:sqlite"
import { users } from "./src/db/schema.js"
import { eq } from "drizzle-orm"

const sqlite = new Database(process.env.DATABASE_PATH || "./netdisk.db")
const db = drizzle(sqlite, { schema: { users } })

async function migrateAdminEmail() {
  try {
    console.log("开始迁移管理员邮箱...")
    
    // 查找现有的管理员账户
    const existingAdmin = await db.select().from(users).where(eq(users.id, "admin")).get()
    
    if (existingAdmin) {
      console.log(`找到现有管理员账户: ${existingAdmin.email}`)
      
      // 更新邮箱
      await db.update(users)
        .set({ 
          email: "admin@cialloo.site",
          updatedAt: Date.now()
        })
        .where(eq(users.id, "admin"))
      
      console.log("✅ 管理员邮箱已更新为: admin@cialloo.site")
    } else {
      console.log("❌ 未找到管理员账户")
    }
    
    // 验证更新
    const updatedAdmin = await db.select().from(users).where(eq(users.id, "admin")).get()
    if (updatedAdmin) {
      console.log(`✅ 验证成功，当前管理员邮箱: ${updatedAdmin.email}`)
    }
    
  } catch (error) {
    console.error("❌ 迁移失败:", error)
  } finally {
    sqlite.close()
  }
}

migrateAdminEmail()
