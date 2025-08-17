/**
 * 日志系统 - 支持分级日志、颜色显示、时间戳等功能
 */

// ANSI 颜色代码
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  
  // 前景色
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  
  // 背景色
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  
  // 亮色
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m'
}

// 日志级别枚举
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4
}

// 日志级别配置
const logLevelConfig = {
  [LogLevel.DEBUG]: {
    name: 'DEBUG',
    color: colors.cyan,
    icon: '🔍'
  },
  [LogLevel.INFO]: {
    name: 'INFO',
    color: colors.brightGreen,
    icon: 'ℹ️'
  },
  [LogLevel.WARN]: {
    name: 'WARN',
    color: colors.brightYellow,
    icon: '⚠️'
  },
  [LogLevel.ERROR]: {
    name: 'ERROR',
    color: colors.brightRed,
    icon: '❌'
  },
  [LogLevel.FATAL]: {
    name: 'FATAL',
    color: colors.bgRed + colors.brightWhite,
    icon: '💀'
  }
}

// HTTP 状态码颜色配置
const getStatusCodeColor = (statusCode: number): string => {
  if (statusCode >= 200 && statusCode < 300) {
    return colors.brightGreen // 2xx - 成功
  } else if (statusCode >= 300 && statusCode < 400) {
    return colors.brightCyan // 3xx - 重定向
  } else if (statusCode >= 400 && statusCode < 500) {
    return colors.brightYellow // 4xx - 客户端错误
  } else if (statusCode >= 500) {
    return colors.brightRed // 5xx - 服务器错误
  }
  return colors.white // 其他
}

// HTTP 方法颜色配置
const getMethodColor = (method: string): string => {
  switch (method.toUpperCase()) {
    case 'GET':
      return colors.brightBlue
    case 'POST':
      return colors.brightGreen
    case 'PUT':
      return colors.brightYellow
    case 'DELETE':
      return colors.brightRed
    case 'PATCH':
      return colors.brightMagenta
    case 'OPTIONS':
      return colors.cyan
    case 'HEAD':
      return colors.dim
    default:
      return colors.white
  }
}

// 格式化时间戳
const formatTimestamp = (): string => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  const milliseconds = String(now.getMilliseconds()).padStart(3, '0')
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`
}

// 格式化响应时间
const formatDuration = (duration: number): string => {
  if (duration < 1) {
    return `${(duration * 1000).toFixed(2)}μs`
  } else if (duration < 1000) {
    return `${duration.toFixed(2)}ms`
  } else {
    return `${(duration / 1000).toFixed(2)}s`
  }
}

// 获取响应时间颜色
const getDurationColor = (duration: number): string => {
  if (duration < 100) {
    return colors.brightGreen // 快速响应
  } else if (duration < 500) {
    return colors.brightYellow // 中等响应
  } else {
    return colors.brightRed // 慢响应
  }
}

// 日志配置接口
interface LoggerConfig {
  level: LogLevel
  enableColors: boolean
  enableTimestamp: boolean
  enableIcons: boolean
}

// 从环境变量解析日志等级
const parseLogLevel = (levelStr?: string): LogLevel => {
  if (!levelStr) {
    return process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG
  }

  switch (levelStr.toUpperCase()) {
    case 'DEBUG':
      return LogLevel.DEBUG
    case 'INFO':
      return LogLevel.INFO
    case 'WARN':
      return LogLevel.WARN
    case 'ERROR':
      return LogLevel.ERROR
    case 'FATAL':
      return LogLevel.FATAL
    default:
      console.warn(`⚠️ 无效的日志等级: ${levelStr}，使用默认等级 INFO`)
      return LogLevel.INFO
  }
}

// 默认配置
const defaultConfig: LoggerConfig = {
  level: parseLogLevel(process.env.LOG_LEVEL),
  enableColors: true,
  enableTimestamp: true,
  enableIcons: true
}

class Logger {
  private config: LoggerConfig

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...defaultConfig, ...config }
  }

  // 核心日志方法
  private log(level: LogLevel, message: string, ...args: any[]): void {
    if (level < this.config.level) {
      return
    }

    const levelConfig = logLevelConfig[level]
    const timestamp = this.config.enableTimestamp ? formatTimestamp() : ''
    const icon = this.config.enableIcons ? levelConfig.icon : ''
    const levelName = levelConfig.name.padEnd(5)

    let logMessage = ''

    if (this.config.enableColors) {
      const timestampStr = timestamp ? `${colors.dim}[${timestamp}]${colors.reset} ` : ''
      const levelStr = `${levelConfig.color}${levelName}${colors.reset}`
      const iconStr = icon ? `${icon} ` : ''
      logMessage = `${timestampStr}${levelStr} ${iconStr}${message}`
    } else {
      const timestampStr = timestamp ? `[${timestamp}] ` : ''
      const iconStr = icon ? `${icon} ` : ''
      logMessage = `${timestampStr}${levelName} ${iconStr}${message}`
    }

    // 根据日志级别选择输出方法
    if (level >= LogLevel.ERROR) {
      console.error(logMessage, ...args)
    } else {
      console.log(logMessage, ...args)
    }
  }

  // 公共日志方法
  debug(message: string, ...args: any[]): void {
    this.log(LogLevel.DEBUG, message, ...args)
  }

  info(message: string, ...args: any[]): void {
    this.log(LogLevel.INFO, message, ...args)
  }

  warn(message: string, ...args: any[]): void {
    this.log(LogLevel.WARN, message, ...args)
  }

  error(message: string, ...args: any[]): void {
    this.log(LogLevel.ERROR, message, ...args)
  }

  fatal(message: string, ...args: any[]): void {
    this.log(LogLevel.FATAL, message, ...args)
  }

  // HTTP 请求日志
  http(method: string, path: string, statusCode: number, duration: number, userAgent?: string): void {
    if (LogLevel.INFO < this.config.level) {
      return
    }

    const timestamp = this.config.enableTimestamp ? formatTimestamp() : ''
    const formattedDuration = formatDuration(duration)

    if (this.config.enableColors) {
      const timestampStr = timestamp ? `${colors.dim}[${timestamp}]${colors.reset} ` : ''
      const methodStr = `${getMethodColor(method)}${method.padEnd(6)}${colors.reset}`
      const statusStr = `${getStatusCodeColor(statusCode)}${statusCode}${colors.reset}`
      const durationStr = `${getDurationColor(duration)}${formattedDuration}${colors.reset}`
      const pathStr = `${colors.brightWhite}${path}${colors.reset}`
      
      let logMessage = `${timestampStr}${colors.brightCyan}HTTP${colors.reset}  🌐 ${methodStr} ${pathStr} ${statusStr} ${durationStr}`
      
      if (userAgent) {
        logMessage += ` ${colors.dim}${userAgent}${colors.reset}`
      }
      
      console.log(logMessage)
    } else {
      const timestampStr = timestamp ? `[${timestamp}] ` : ''
      let logMessage = `${timestampStr}HTTP   🌐 ${method.padEnd(6)} ${path} ${statusCode} ${formattedDuration}`
      
      if (userAgent) {
        logMessage += ` ${userAgent}`
      }
      
      console.log(logMessage)
    }
  }

  // 数据库操作日志
  database(operation: string, table: string, duration?: number, error?: Error): void {
    const timestamp = this.config.enableTimestamp ? formatTimestamp() : ''
    
    if (error) {
      if (this.config.enableColors) {
        const timestampStr = timestamp ? `${colors.dim}[${timestamp}]${colors.reset} ` : ''
        const message = `${timestampStr}${colors.brightRed}DB${colors.reset}     💾 ${colors.brightRed}${operation}${colors.reset} ${colors.brightWhite}${table}${colors.reset} ${colors.brightRed}FAILED${colors.reset}`
        console.error(message, error.message)
      } else {
        const timestampStr = timestamp ? `[${timestamp}] ` : ''
        console.error(`${timestampStr}DB     💾 ${operation} ${table} FAILED`, error.message)
      }
    } else {
      const durationStr = duration ? ` ${formatDuration(duration)}` : ''
      
      if (this.config.enableColors) {
        const timestampStr = timestamp ? `${colors.dim}[${timestamp}]${colors.reset} ` : ''
        const durationColor = duration ? getDurationColor(duration) : colors.reset
        const message = `${timestampStr}${colors.brightBlue}DB${colors.reset}     💾 ${colors.brightGreen}${operation}${colors.reset} ${colors.brightWhite}${table}${colors.reset}${durationColor}${durationStr}${colors.reset}`
        console.log(message)
      } else {
        const timestampStr = timestamp ? `[${timestamp}] ` : ''
        console.log(`${timestampStr}DB     💾 ${operation} ${table}${durationStr}`)
      }
    }
  }

  // 邮件发送日志
  email(to: string, subject: string, success: boolean, error?: Error): void {
    const timestamp = this.config.enableTimestamp ? formatTimestamp() : ''
    
    if (success) {
      if (this.config.enableColors) {
        const timestampStr = timestamp ? `${colors.dim}[${timestamp}]${colors.reset} ` : ''
        const message = `${timestampStr}${colors.brightMagenta}EMAIL${colors.reset}  📧 ${colors.brightGreen}SENT${colors.reset} to ${colors.brightWhite}${to}${colors.reset} - ${colors.dim}${subject}${colors.reset}`
        console.log(message)
      } else {
        const timestampStr = timestamp ? `[${timestamp}] ` : ''
        console.log(`${timestampStr}EMAIL  📧 SENT to ${to} - ${subject}`)
      }
    } else {
      if (this.config.enableColors) {
        const timestampStr = timestamp ? `${colors.dim}[${timestamp}]${colors.reset} ` : ''
        const message = `${timestampStr}${colors.brightMagenta}EMAIL${colors.reset}  📧 ${colors.brightRed}FAILED${colors.reset} to ${colors.brightWhite}${to}${colors.reset} - ${colors.dim}${subject}${colors.reset}`
        console.error(message, error?.message || 'Unknown error')
      } else {
        const timestampStr = timestamp ? `[${timestamp}] ` : ''
        console.error(`${timestampStr}EMAIL  📧 FAILED to ${to} - ${subject}`, error?.message || 'Unknown error')
      }
    }
  }

  // 文件操作日志
  file(operation: string, filename: string, size?: number, success: boolean = true, error?: Error): void {
    const timestamp = this.config.enableTimestamp ? formatTimestamp() : ''
    const sizeStr = size ? ` (${this.formatFileSize(size)})` : ''
    
    if (success) {
      if (this.config.enableColors) {
        const timestampStr = timestamp ? `${colors.dim}[${timestamp}]${colors.reset} ` : ''
        const message = `${timestampStr}${colors.brightCyan}FILE${colors.reset}   📁 ${colors.brightGreen}${operation}${colors.reset} ${colors.brightWhite}${filename}${colors.reset}${colors.dim}${sizeStr}${colors.reset}`
        console.log(message)
      } else {
        const timestampStr = timestamp ? `[${timestamp}] ` : ''
        console.log(`${timestampStr}FILE   📁 ${operation} ${filename}${sizeStr}`)
      }
    } else {
      if (this.config.enableColors) {
        const timestampStr = timestamp ? `${colors.dim}[${timestamp}]${colors.reset} ` : ''
        const message = `${timestampStr}${colors.brightCyan}FILE${colors.reset}   📁 ${colors.brightRed}${operation} FAILED${colors.reset} ${colors.brightWhite}${filename}${colors.reset}${colors.dim}${sizeStr}${colors.reset}`
        console.error(message, error?.message || 'Unknown error')
      } else {
        const timestampStr = timestamp ? `[${timestamp}] ` : ''
        console.error(`${timestampStr}FILE   📁 ${operation} FAILED ${filename}${sizeStr}`, error?.message || 'Unknown error')
      }
    }
  }

  // 格式化文件大小
  private formatFileSize(bytes: number): string {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    if (bytes === 0) return '0 B'
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`
  }

  // 更新配置
  updateConfig(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config }
  }

  // 获取当前配置
  getConfig(): LoggerConfig {
    return { ...this.config }
  }
}

// 创建默认日志实例
export const logger = new Logger()

// 导出 Logger 类以便创建自定义实例
export { Logger, LoggerConfig }

// 导出颜色常量以便其他模块使用
export { colors }
