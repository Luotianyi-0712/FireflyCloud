import { logger } from "./logger"

/**
 * 从请求头中获取基础URL
 * 支持反向代理场景，优先使用代理头信息
 */
export function getBaseUrl(headers: Record<string, string | undefined>): string {
  // 1. 优先使用环境变量配置的后端URL
  if (process.env.BACKEND_URL) {
    logger.debug(`使用环境变量 BACKEND_URL: ${process.env.BACKEND_URL}`)
    return process.env.BACKEND_URL
  }

  // 2. 从请求头中自动获取域名
  // 检查反向代理头信息
  const forwardedProto = headers['x-forwarded-proto'] || headers['x-forwarded-protocol']
  const forwardedHost = headers['x-forwarded-host'] || headers['x-forwarded-server']
  const host = headers['host']

  let protocol = 'http'
  let hostname = 'localhost:8080'

  // 确定协议
  if (forwardedProto) {
    protocol = forwardedProto
    logger.debug(`从 X-Forwarded-Proto 获取协议: ${protocol}`)
  } else if (headers['x-forwarded-ssl'] === 'on' || headers['x-forwarded-scheme'] === 'https') {
    protocol = 'https'
    logger.debug(`从其他代理头判断为 HTTPS 协议`)
  }

  // 确定主机名
  if (forwardedHost) {
    hostname = forwardedHost
    logger.debug(`从 X-Forwarded-Host 获取主机名: ${hostname}`)
  } else if (host) {
    hostname = host
    logger.debug(`从 Host 头获取主机名: ${hostname}`)
  }

  const baseUrl = `${protocol}://${hostname}`
  logger.debug(`自动构建的基础URL: ${baseUrl}`)
  
  return baseUrl
}

/**
 * 从请求头中获取前端URL
 * 用于CORS和重定向
 */
export function getFrontendUrl(headers: Record<string, string | undefined>): string {
  // 1. 优先使用环境变量配置的前端URL
  if (process.env.FRONTEND_URL) {
    logger.debug(`使用环境变量 FRONTEND_URL: ${process.env.FRONTEND_URL}`)
    return process.env.FRONTEND_URL
  }

  // 2. 从 Referer 头获取前端域名
  const referer = headers['referer'] || headers['origin']
  if (referer) {
    try {
      const url = new URL(referer)
      const frontendUrl = `${url.protocol}//${url.host}`
      logger.debug(`从 Referer/Origin 获取前端URL: ${frontendUrl}`)
      return frontendUrl
    } catch (error) {
      logger.warn(`解析 Referer/Origin 失败: ${referer}`)
    }
  }

  // 3. 根据后端URL推测前端URL（开发环境）
  const backendUrl = getBaseUrl(headers)
  if (backendUrl.includes('localhost:8080')) {
    const frontendUrl = 'http://localhost:3000'
    logger.debug(`开发环境，推测前端URL: ${frontendUrl}`)
    return frontendUrl
  }

  // 4. 默认返回后端URL（生产环境可能前后端同域）
  logger.debug(`使用后端URL作为前端URL: ${backendUrl}`)
  return backendUrl
}
