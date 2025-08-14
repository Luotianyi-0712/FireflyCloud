import { Elysia } from "elysia"
import { cors } from "@elysiajs/cors"
import { swagger } from "@elysiajs/swagger"
import { jwt } from "@elysiajs/jwt"
import { bearer } from "@elysiajs/bearer"

import { authRoutes } from "./routes/auth"
import { fileRoutes } from "./routes/files"
import { folderRoutes } from "./routes/folders"
import { adminRoutes } from "./routes/admin"
import { storageRoutes } from "./routes/storage"
import { downloadRoutes } from "./routes/download"
import { shareRoutes } from "./routes/share"
import { pickupRoutes } from "./routes/pickup"
import { logger } from "./utils/logger"
import { loggingMiddleware } from "./middleware/logging"
import { startCleanupScheduler } from "./utils/cleanup"

// 检查必要的环境变量
function validateEnvironmentVariables() {
  logger.info('🔍 开始检查环境变量配置...')

  const requiredEnvVars = [
    'JWT_SECRET',
    'DATABASE_URL'
  ]

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName])

  if (missingVars.length > 0) {
    logger.fatal('服务启动失败：缺少必要的环境变量')
    logger.error(`缺少的环境变量: ${missingVars.join(', ')}`)
    logger.error('')
    logger.error('请在 backend/.env 文件中配置以下变量:')
    logger.error('JWT_SECRET=your_jwt_secret_key')
    logger.error('DATABASE_URL=./netdisk.db')
    logger.error('PORT=8080 (可选)')
    logger.error('')
    logger.error('SMTP 配置现在可以在管理面板中设置，或者通过环境变量配置:')
    logger.error('SMTP_HOST=your_smtp_host (可选)')
    logger.error('SMTP_PORT=your_smtp_port (可选)')
    logger.error('SMTP_USER=your_smtp_user (可选)')
    logger.error('SMTP_PASS=your_smtp_password (可选)')
    logger.error('')
    logger.error('配置完成后请重新启动服务')
    process.exit(1)
  }

  logger.info('环境变量检查通过')

  // 检查 SMTP 环境变量（可选）
  const smtpEnvVars = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS']
  const missingSmtpVars = smtpEnvVars.filter(varName => !process.env[varName])

  if (missingSmtpVars.length === 0) {
    logger.info('SMTP 环境变量配置完整')
  } else {
    logger.info('SMTP 环境变量不完整，可在管理面板中配置')
  }
}

// 启动前检查环境变量
validateEnvironmentVariables()

logger.info('🚀 正在启动 NetDisk API 服务器...')

const app = new Elysia()
  // 添加日志中间件（在其他中间件之前）
  .use(loggingMiddleware)
  .use(
    cors({
      origin: (request) => {
        const origin = request.headers.get('origin')

        // 允许的域名列表
        const allowedOrigins = [
          "http://localhost:3000",
          "https://drive.cialloo.site",
          process.env.FRONTEND_URL
        ].filter(Boolean) // 过滤掉空值

        // 如果没有origin（比如同源请求）或者origin在允许列表中，则允许
        if (!origin || allowedOrigins.includes(origin)) {
          return true
        }

        // 开发环境允许localhost的任意端口
        if (process.env.NODE_ENV === 'development' && origin?.startsWith('http://localhost:')) {
          return true
        }

        return false
      },
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
  .get("/", () => {
    logger.debug('健康检查请求 - 根路径')
    return { message: "NetDisk API Server Running" }
  })
  .get("/health", () => {
    logger.debug('健康检查请求 - /health')
    return { status: "ok", timestamp: new Date().toISOString() }
  })
  .use(authRoutes)
  .use(fileRoutes)
  .use(folderRoutes)
  .use(adminRoutes)
  .use(storageRoutes)
  .use(downloadRoutes)
  .use(shareRoutes)
  .use(pickupRoutes)
  .listen(process.env.PORT || 8080)

const port = app.server?.port || process.env.PORT || 8080
logger.info(`NetDisk API 服务器启动成功`)
logger.info(`🌐 服务地址: http://localhost:${port}`)
logger.info(`📚 API 文档: http://localhost:${port}/swagger`)
logger.info(`💾 数据库: ${process.env.DATABASE_URL || './netdisk.db'}`)
logger.info(`🔧 环境: ${process.env.NODE_ENV || 'development'}`)

// 启动下载令牌清理调度器
startCleanupScheduler()

logger.info('服务器已准备就绪，等待请求...')
