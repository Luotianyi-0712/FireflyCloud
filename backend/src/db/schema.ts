import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("user"),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
})

export const emailVerificationCodes = sqliteTable("email_verification_codes", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  code: text("code").notNull(),
  expiresAt: integer("expires_at").notNull(),
  used: integer("used", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
})

export const folders = sqliteTable("folders", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  parentId: text("parent_id"), // null for root folders
  path: text("path").notNull(), // full path for easy querying
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
})

export const files = sqliteTable("files", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  folderId: text("folder_id"), // null for root files
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  size: integer("size").notNull(),
  mimeType: text("mime_type").notNull(),
  storageType: text("storage_type").notNull(),
  storagePath: text("storage_path").notNull(),
  createdAt: integer("created_at").notNull(),
})

export const storageConfig = sqliteTable("storage_config", {
  id: integer("id").primaryKey().default(1),
  storageType: text("storage_type").notNull().default("local"),
  r2Endpoint: text("r2_endpoint"),
  r2AccessKey: text("r2_access_key"),
  r2SecretKey: text("r2_secret_key"),
  r2Bucket: text("r2_bucket"),
  // 新增字段支持混合模式
  enableMixedMode: integer("enable_mixed_mode", { mode: "boolean" }).notNull().default(false),
  updatedAt: integer("updated_at").notNull(),
})

// 新增 R2 挂载点表
export const r2MountPoints = sqliteTable("r2_mount_points", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  folderId: text("folder_id").notNull(), // 挂载到的本地文件夹
  r2Path: text("r2_path").notNull(), // R2 存储桶中的路径
  mountName: text("mount_name").notNull(), // 挂载点显示名称
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
})

export const smtpConfig = sqliteTable("smtp_config", {
  id: integer("id").primaryKey().default(1),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  host: text("host"),
  port: integer("port").default(465),
  user: text("user"),
  pass: text("pass"),
  secure: integer("secure", { mode: "boolean" }).notNull().default(true),
  emailTemplate: text("email_template"),
  updatedAt: integer("updated_at").notNull(),
})

export const downloadTokens = sqliteTable("download_tokens", {
  id: text("id").primaryKey(),
  fileId: text("file_id").notNull(),
  userId: text("user_id").notNull(),
  token: text("token").notNull().unique(),
  used: integer("used", { mode: "boolean" }).notNull().default(false), // 保持兼容性，但将逐步废弃
  usageCount: integer("usage_count").notNull().default(0), // 新增：使用次数计数器
  maxUsage: integer("max_usage").notNull().default(2), // 新增：最大使用次数，默认2次
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
})

export const fileDirectLinks = sqliteTable("file_direct_links", {
  id: text("id").primaryKey(),
  fileId: text("file_id").notNull().unique(), // 一个文件只能有一个直链
  userId: text("user_id").notNull(),
  directName: text("direct_name").notNull().unique(), // 直链使用的文件名
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  accessCount: integer("access_count").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
})

export const fileShares = sqliteTable("file_shares", {
  id: text("id").primaryKey(),
  fileId: text("file_id").notNull(),
  userId: text("user_id").notNull(),
  shareToken: text("share_token").unique(), // 分享链接token，可选（取件码模式不需要）
  pickupCode: text("pickup_code"), // 取件码，可选
  requireLogin: integer("require_login", { mode: "boolean" }).notNull().default(false),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  accessCount: integer("access_count").notNull().default(0),
  expiresAt: integer("expires_at"), // 过期时间，可选
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
})
