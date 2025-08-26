import { logger } from "./logger"

/**
 * 从请求头中获取基础URL
 * 支持反向代理场景，优先使用自动检测
 */
export function getBaseUrl(headers: Record<string, string | undefined>): string {
  // 1. 优先从请求头中自动获取域名
  // 检查反向代理头信息
  const forwardedProto = headers['x-forwarded-proto'] || headers['x-forwarded-protocol']
  const forwardedHost = headers['x-forwarded-host'] || headers['x-forwarded-server']
  const host = headers['host']
  const origin = headers['origin']
  const referer = headers['referer']

  let protocol = 'http'
  let hostname = 'localhost:8080'
  let autoDetected = false

  // 确定协议
  if (forwardedProto) {
    protocol = forwardedProto
    logger.debug(`从 X-Forwarded-Proto 获取协议: ${protocol}`)
    autoDetected = true
  } else if (headers['x-forwarded-ssl'] === 'on' || headers['x-forwarded-scheme'] === 'https') {
    protocol = 'https'
    logger.debug(`从其他代理头判断为 HTTPS 协议`)
    autoDetected = true
  }

  // 确定主机名
  if (forwardedHost) {
    hostname = forwardedHost
    logger.debug(`从 X-Forwarded-Host 获取主机名: ${hostname}`)
    autoDetected = true
  } else if (host && !host.includes('127.0.0.1') && !host.includes('localhost')) {
    hostname = host
    logger.debug(`从 Host 头获取主机名: ${hostname}`)
    autoDetected = true
  }

  // 如果自动检测成功，使用检测结果
  if (autoDetected) {
    const baseUrl = `${protocol}://${hostname}`
    logger.debug(`自动检测成功，使用基础URL: ${baseUrl}`)
    return baseUrl
  }

  // 尝试从Origin或Referer获取
  if (origin && !origin.includes('127.0.0.1') && !origin.includes('localhost')) {
    try {
      const originUrl = new URL(origin)
      const baseUrl = `${originUrl.protocol}//${originUrl.host}`
      logger.debug(`从 Origin 获取基础URL: ${baseUrl}`)
      return baseUrl
    } catch (e) {
      logger.debug(`解析 Origin 失败: ${origin}`)
    }
  }

  if (referer && !referer.includes('127.0.0.1') && !referer.includes('localhost')) {
    try {
      const refererUrl = new URL(referer)
      const baseUrl = `${refererUrl.protocol}//${refererUrl.host}`
      logger.debug(`从 Referer 获取基础URL: ${baseUrl}`)
      return baseUrl
    } catch (e) {
      logger.debug(`解析 Referer 失败: ${referer}`)
    }
  }

  // 2. 自动检测失败时，使用环境变量作为回退
  if (process.env.BACKEND_URL) {
    logger.debug(`自动检测失败，使用环境变量 BACKEND_URL: ${process.env.BACKEND_URL}`)
    return process.env.BACKEND_URL
  }

  // 3. 最后的回退方案
  const fallbackUrl = `${protocol}://${hostname}`
  logger.debug(`使用默认回退URL: ${fallbackUrl}`)
  return fallbackUrl
}

/**
 * 从请求头中获取前端URL
 * 用于CORS和重定向
 */
export function getFrontendUrl(headers: Record<string, string | undefined>): string {
  // 1. 优先从 Referer 头获取前端域名
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

  // 2. 使用环境变量作为回退
  if (process.env.FRONTEND_URL) {
    logger.debug(`使用环境变量 FRONTEND_URL: ${process.env.FRONTEND_URL}`)
    return process.env.FRONTEND_URL
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
