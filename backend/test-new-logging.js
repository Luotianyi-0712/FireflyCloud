#!/usr/bin/env bun

/**
 * 测试新的日志格式
 */

// 设置环境变量
process.env.LOG_LEVEL = 'INFO'

console.log('🧪 测试新的INFO级别日志格式...\n')

// 动态导入logger
try {
  const { logger } = await import('./src/utils/logger.ts')

  console.log('🔍 测试logger基本功能:')
  logger.info('这是一条INFO日志')
  logger.warn('这是一条WARN日志')
  logger.error('这是一条ERROR日志')

  console.log('\n📊 HTTP请求日志示例:')
  logger.http('GET', '/files', 200, 45.23, 'Mozilla/5.0', '192.168.1.100')
  logger.http('POST', '/auth/login', 201, 123.45, 'Chrome/91.0', '192.168.1.100')
  logger.http('GET', '/dl/example.pdf?token=abc123', 302, 12.34, 'Firefox/89.0', '203.0.113.1')
  logger.http('GET', '/files/nonexistent', 404, 8.90, 'Safari/14.0', '198.51.100.1')
  logger.http('POST', '/auth/login', 401, 56.78, 'Edge/91.0', '203.0.113.1')
  logger.http('POST', '/files/upload', 500, 234.56, 'Chrome/91.0', '192.168.1.100')

  console.log('\n⚡ 慢请求示例:')
  logger.http('GET', '/files/large-download', 200, 1234.56, 'Chrome/91.0', '192.168.1.100')

  console.log('\n🚀 快速请求示例:')
  logger.http('GET', '/health', 200, 2.34, 'curl/7.68.0', '127.0.0.1')

  console.log('\n✅ 日志格式测试完成')
  console.log('\n📝 新格式说明:')
  console.log('   格式: 状态码-方法路径-响应时间-IP地址')
  console.log('   颜色: 状态码(绿/青/黄/红) 方法(蓝/绿/黄/红/紫/青) 响应时间(绿/黄/红)')
  console.log('   示例: 200-GET/files-45.23ms-192.168.1.100')
} catch (error) {
  console.error('测试失败:', error)
}
