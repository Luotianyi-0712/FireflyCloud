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

export const files = sqliteTable("files", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
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
