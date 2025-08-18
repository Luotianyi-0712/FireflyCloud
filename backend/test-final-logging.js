#!/usr/bin/env bun

/**
 * 测试最终的日志系统
 */

console.log('🧪 测试最终的日志系统...\n')

// 设置环境变量为INFO级别
process.env.LOG_LEVEL = 'INFO'

// 等待一段时间让服务器启动
await new Promise(resolve => setTimeout(resolve, 2000))

console.log('📡 发送测试请求到服务器...\n')

try {
  // 发送几个测试请求
  const baseUrl = 'http://localhost:8080'
  
  console.log('发送请求到 /test-log...')
  const response1 = await fetch(`${baseUrl}/test-log`)
  console.log(`响应: ${response1.status} ${response1.statusText}`)
  
  console.log('\n发送请求到 /health...')
  const response2 = await fetch(`${baseUrl}/health`)
  console.log(`响应: ${response2.status} ${response2.statusText}`)
  
  console.log('\n发送请求到 /nonexistent...')
  const response3 = await fetch(`${baseUrl}/nonexistent`)
  console.log(`响应: ${response3.status} ${response3.statusText}`)
  
  console.log('\n✅ 测试完成！')
  console.log('\n📝 预期结果:')
  console.log('- 应该看到简洁的HTTP日志格式: 状态码-方法路径-响应时间-IP地址')
  console.log('- 不应该看到详细的数据库初始化日志')
  console.log('- 只显示启动信息和HTTP请求日志')

} catch (error) {
  console.error('测试失败:', error.message)
  console.log('\n💡 提示: 请确保后端服务器正在运行 (bun run dev)')
}
