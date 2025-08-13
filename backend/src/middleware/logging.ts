/**
 * HTTP 请求日志中间件 - 为 Elysia 框架提供详细的请求日志记录
 */

import { Elysia } from "elysia"
import { logger } from "../utils/logger"

// 请求日志配置接口
interface LoggingConfig {
  // 是否启用请求日志
  enabled: boolean
  // 是否记录请求体（仅用于调试，生产环境建议关闭）
  logRequestBody: boolean
  // 是否记录响应体（仅用于调试，生产环境建议关闭）
  logResponseBody: boolean
  // 是否记录用户代理
  logUserAgent: boolean
  // 是否记录IP地址
  logIpAddress: boolean
  // 是否记录请求头
  logHeaders: boolean
  // 需要过滤的敏感头部字段
  sensitiveHeaders: string[]
  // 需要跳过日志记录的路径
  skipPaths: string[]
  // 慢请求阈值（毫秒）
  slowRequestThreshold: number
}

// 默认配置
const defaultConfig: LoggingConfig = {
  enabled: true,
  logRequestBody: process.env.NODE_ENV !== 'production',
  logResponseBody: false, // 通常不记录响应体，避免日志过大
  logUserAgent: true,
  logIpAddress: true,
  logHeaders: process.env.NODE_ENV !== 'production',
  sensitiveHeaders: [
    'authorization',
    'cookie',
    'set-cookie',
    'x-api-key',
    'x-auth-token',
    'password',
    'secret'
  ],
  skipPaths: [
    '/health',
    '/favicon.ico',
    '/robots.txt'
  ],
  slowRequestThreshold: 1000 // 1秒
}

// 获取客户端IP地址
function getClientIp(request: Request, headers: Record<string, string | undefined>): string {
  // 尝试从各种可能的头部获取真实IP
  const xForwardedFor = headers['x-forwarded-for']
  const xRealIp = headers['x-real-ip']
  const xClientIp = headers['x-client-ip']
  const cfConnectingIp = headers['cf-connecting-ip'] // Cloudflare
  
  if (xForwardedFor) {
    // X-Forwarded-For 可能包含多个IP，取第一个
    return xForwardedFor.split(',')[0].trim()
  }
  
  if (cfConnectingIp) {
    return cfConnectingIp
  }
  
  if (xRealIp) {
    return xRealIp
  }
  
  if (xClientIp) {
    return xClientIp
  }
  
  // 如果都没有，尝试从URL获取（这通常不会有IP信息）
  try {
    const url = new URL(request.url)
    return url.hostname
  } catch {
    return 'unknown'
  }
}

// 过滤敏感头部信息
function filterSensitiveHeaders(headers: Record<string, string | undefined>, sensitiveHeaders: string[]): Record<string, string | undefined> {
  const filtered: Record<string, string | undefined> = {}
  
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase()
    if (sensitiveHeaders.some(sensitive => lowerKey.includes(sensitive.toLowerCase()))) {
      filtered[key] = '[REDACTED]'
    } else {
      filtered[key] = value
    }
  }
  
  return filtered
}

// 格式化请求体（用于日志记录）
function formatRequestBody(body: any): string {
  if (!body) return ''
  
  try {
    if (typeof body === 'string') {
      // 尝试解析JSON
      try {
        const parsed = JSON.parse(body)
        return JSON.stringify(parsed, null, 2)
      } catch {
        return body.length > 1000 ? body.substring(0, 1000) + '...' : body
      }
    } else if (typeof body === 'object') {
      return JSON.stringify(body, null, 2)
    } else {
      return String(body)
    }
  } catch (error) {
    return '[Unable to format body]'
  }
}

// 创建日志中间件
export function createLoggingMiddleware(config: Partial<LoggingConfig> = {}) {
  const finalConfig: LoggingConfig = { ...defaultConfig, ...config }
  
  return new Elysia({ name: 'logging' })
    .onRequest(({ request, set }) => {
      if (!finalConfig.enabled) return
      
      const url = new URL(request.url)
      const path = url.pathname
      
      // 检查是否需要跳过此路径
      if (finalConfig.skipPaths.some(skipPath => path.startsWith(skipPath))) {
        return
      }
      
      // 记录请求开始时间
      set.headers = set.headers || {}
      set.headers['x-request-start-time'] = Date.now().toString()
      
      // 记录请求开始日志
      const method = request.method
      const userAgent = request.headers.get('user-agent') || 'unknown'
      const clientIp = getClientIp(request, Object.fromEntries(request.headers.entries()))
      
      let logMessage = `${method} ${path}`
      
      if (finalConfig.logIpAddress) {
        logMessage += ` from ${clientIp}`
      }
      
      logger.debug(`📥 Request started: ${logMessage}`)
      
      // 记录详细的请求信息（仅在调试模式下）
      if (finalConfig.logHeaders && process.env.NODE_ENV !== 'production') {
        const headers = Object.fromEntries(request.headers.entries())
        const filteredHeaders = filterSensitiveHeaders(headers, finalConfig.sensitiveHeaders)
        logger.debug('📋 Request headers:', filteredHeaders)
      }
    })
    .onAfterHandle(({ request, response, set }) => {
      if (!finalConfig.enabled) return
      
      const url = new URL(request.url)
      const path = url.pathname
      
      // 检查是否需要跳过此路径
      if (finalConfig.skipPaths.some(skipPath => path.startsWith(skipPath))) {
        return
      }
      
      // 计算响应时间
      const startTime = parseInt(set.headers?.['x-request-start-time'] as string || '0')
      const duration = startTime ? Date.now() - startTime : 0
      
      // 获取状态码
      const statusCode = set.status || 200
      
      // 获取用户代理
      const userAgent = finalConfig.logUserAgent ? request.headers.get('user-agent') : undefined
      
      // 记录HTTP请求日志
      logger.http(request.method, path, statusCode, duration, userAgent)
      
      // 如果是慢请求，记录警告
      if (duration > finalConfig.slowRequestThreshold) {
        const clientIp = getClientIp(request, Object.fromEntries(request.headers.entries()))
        logger.warn(`🐌 Slow request detected: ${request.method} ${path} took ${duration}ms from ${clientIp}`)
      }
      
      // 记录响应体（仅在调试模式下）
      if (finalConfig.logResponseBody && process.env.NODE_ENV !== 'production') {
        try {
          if (response && typeof response === 'object') {
            logger.debug('📤 Response body:', JSON.stringify(response, null, 2))
          }
        } catch (error) {
          logger.debug('📤 Response body: [Unable to serialize]')
        }
      }
    })
    .onError(({ request, error, set }) => {
      if (!finalConfig.enabled) return
      
      const url = new URL(request.url)
      const path = url.pathname
      
      // 检查是否需要跳过此路径
      if (finalConfig.skipPaths.some(skipPath => path.startsWith(skipPath))) {
        return
      }
      
      // 计算响应时间
      const startTime = parseInt(set.headers?.['x-request-start-time'] as string || '0')
      const duration = startTime ? Date.now() - startTime : 0
      
      // 获取状态码
      const statusCode = set.status || 500
      
      // 获取客户端信息
      const clientIp = getClientIp(request, Object.fromEntries(request.headers.entries()))
      const userAgent = request.headers.get('user-agent') || 'unknown'
      
      // 记录错误日志
      logger.error(`💥 Request failed: ${request.method} ${path} ${statusCode} ${duration}ms from ${clientIp}`)
      logger.error(`Error details: ${error.message}`)
      
      // 在开发环境下记录完整的错误堆栈
      if (process.env.NODE_ENV !== 'production') {
        logger.debug('Error stack:', error.stack)
      }
    })
}

// 导出默认配置的中间件
export const loggingMiddleware = createLoggingMiddleware()

// 导出配置接口和默认配置
export { LoggingConfig, defaultConfig as defaultLoggingConfig }
