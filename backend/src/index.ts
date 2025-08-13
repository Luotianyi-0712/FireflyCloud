import { Elysia } from "elysia"
import { cors } from "@elysiajs/cors"
import { swagger } from "@elysiajs/swagger"
import { jwt } from "@elysiajs/jwt"
import { bearer } from "@elysiajs/bearer"

import { authRoutes } from "./routes/auth"
import { fileRoutes } from "./routes/files"
import { adminRoutes } from "./routes/admin"
import { storageRoutes } from "./routes/storage"

// 检查必要的环境变量
function validateEnvironmentVariables() {
  const requiredEnvVars = [
    'JWT_SECRET',
    'DATABASE_URL'
  ]

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName])

  if (missingVars.length > 0) {
    console.error('❌ 服务启动失败：缺少必要的环境变量')
    console.error('缺少的环境变量:', missingVars.join(', '))
    console.error('')
    console.error('请在 backend/.env 文件中配置以下变量:')
    console.error('JWT_SECRET=your_jwt_secret_key')
    console.error('DATABASE_URL=./netdisk.db')
    console.error('PORT=8080 (可选)')
    console.error('')
    console.error('SMTP 配置现在可以在管理面板中设置，或者通过环境变量配置:')
    console.error('SMTP_HOST=your_smtp_host (可选)')
    console.error('SMTP_PORT=your_smtp_port (可选)')
    console.error('SMTP_USER=your_smtp_user (可选)')
    console.error('SMTP_PASS=your_smtp_password (可选)')
    console.error('')
    console.error('配置完成后请重新启动服务')
    process.exit(1)
  }

  console.log('✅ 环境变量检查通过')

  // 检查 SMTP 环境变量（可选）
  const smtpEnvVars = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS']
  const missingSmtpVars = smtpEnvVars.filter(varName => !process.env[varName])

  if (missingSmtpVars.length === 0) {
    console.log('✅ SMTP 环境变量配置完整')
  } else {
    console.log('ℹ️ SMTP 环境变量不完整，可在管理面板中配置')
  }
}

// 启动前检查环境变量
validateEnvironmentVariables()

const app = new Elysia()
  .use(
    cors({
      origin: process.env.FRONTEND_URL || "http://localhost:3000",
      credentials: true,
    }),
  )
  .use(
    swagger({
      documentation: {
        info: {
          title: "NetDisk API",
          version: "1.0.0",
          description: "Universal NetDisk API with local and R2 storage support",
        },
      },
    }),
  )
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET!,
    }),
  )
  .use(bearer())
  .get("/", () => ({ message: "NetDisk API Server Running" }))
  .get("/health", () => ({ status: "ok", timestamp: new Date().toISOString() }))
  .use(authRoutes)
  .use(fileRoutes)
  .use(adminRoutes)
  .use(storageRoutes)
  .listen(process.env.PORT || 8080)

console.log(`🚀 NetDisk API Server running at http://localhost:${app.server?.port}`)
