/**
 * 日志系统测试脚本
 * 用于演示新的日志功能
 */

// 由于这是一个测试脚本，我们需要使用 CommonJS 语法
const { logger } = require('./dist/utils/logger.js')

console.log('='.repeat(80))
console.log('🧪 FireflyCloud 日志系统测试')
console.log('='.repeat(80))
console.log()

// 测试基本日志级别
console.log('📝 测试基本日志级别:')
logger.debug('这是一条调试信息 - 通常在开发环境中显示')
logger.info('这是一条信息日志 - 记录正常的操作流程')
logger.warn('这是一条警告日志 - 提示潜在的问题')
logger.error('这是一条错误日志 - 记录系统错误')
logger.fatal('这是一条致命错误日志 - 记录严重的系统故障')

console.log()
console.log('🌐 测试 HTTP 请求日志:')
// 模拟不同的HTTP请求
logger.http('GET', '/api/users', 200, 45.2, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
logger.http('POST', '/api/auth/login', 200, 123.7, 'PostmanRuntime/7.32.3')
logger.http('GET', '/api/files/download/123', 404, 12.1)
logger.http('POST', '/api/files/upload', 500, 2341.8, 'curl/7.68.0')
logger.http('DELETE', '/api/files/456', 200, 89.3)

console.log()
console.log('💾 测试数据库操作日志:')
// 模拟数据库操作
logger.database('SELECT', 'users', 15.2)
logger.database('INSERT', 'files', 8.7)
logger.database('UPDATE', 'storage_config', 23.1)
logger.database('DELETE', 'email_verification_codes', 5.9)
logger.database('SELECT', 'users', undefined, new Error('Connection timeout'))

console.log()
console.log('📧 测试邮件发送日志:')
// 模拟邮件发送
logger.email('user@example.com', '【FireflyCloud】邮箱验证码', true)
logger.email('test@domain.com', '【FireflyCloud】密码重置', false, new Error('SMTP connection failed'))
logger.email('admin@company.com', '【FireflyCloud】系统通知', true)

console.log()
console.log('📁 测试文件操作日志:')
// 模拟文件操作
logger.file('UPLOAD', 'document.pdf', 2048576, true)
logger.file('DOWNLOAD', 'image.jpg', 1024000, true)
logger.file('DELETE', 'old-file.txt', 512, true)
logger.file('UPLOAD', 'large-video.mp4', 104857600, false, new Error('Disk space insufficient'))

console.log()
console.log('⚙️ 测试不同响应时间的颜色显示:')
// 测试不同响应时间的颜色
logger.http('GET', '/api/health', 200, 15.3)      // 快速 - 绿色
logger.http('GET', '/api/dashboard', 200, 234.7)  // 中等 - 黄色
logger.http('POST', '/api/search', 200, 1247.9)   // 慢速 - 红色

console.log()
console.log('🎨 测试不同状态码的颜色显示:')
// 测试不同状态码的颜色
logger.http('GET', '/api/users', 200, 45)    // 2xx - 绿色
logger.http('GET', '/api/redirect', 301, 12) // 3xx - 青色
logger.http('GET', '/api/notfound', 404, 8)  // 4xx - 黄色
logger.http('POST', '/api/error', 500, 156)  // 5xx - 红色

console.log()
console.log('🔧 测试配置更新:')
// 测试日志配置
const originalConfig = logger.getConfig()
console.log('当前配置:', originalConfig)

// 临时禁用颜色
logger.updateConfig({ enableColors: false })
logger.info('这条日志没有颜色显示')

// 恢复颜色
logger.updateConfig({ enableColors: true })
logger.info('颜色显示已恢复')

console.log()
console.log('✅ 日志系统测试完成!')
console.log('='.repeat(80))
