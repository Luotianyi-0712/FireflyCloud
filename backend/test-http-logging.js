#!/usr/bin/env bun

/**
 * 测试HTTP日志中间件
 */

console.log('🧪 测试HTTP日志中间件...\n')

// 启动服务器
const { spawn } = require('child_process')

// 设置环境变量
process.env.LOG_LEVEL = 'INFO'

console.log('📡 启动后端服务器...')

// 启动后端服务器
const server = spawn('bun', ['run', 'dev'], {
  cwd: process.cwd(),
  stdio: 'inherit',
  env: { ...process.env, LOG_LEVEL: 'INFO' }
})

// 等待服务器启动
await new Promise(resolve => setTimeout(resolve, 3000))

console.log('\n🔥 发送测试请求...')

try {
  // 发送几个测试请求
  const requests = [
    fetch('http://localhost:8080/'),
    fetch('http://localhost:8080/health'),
    fetch('http://localhost:8080/test-log'),
    fetch('http://localhost:8080/nonexistent'),
  ]

  const responses = await Promise.allSettled(requests)
  
  console.log('\n📊 请求结果:')
  responses.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      console.log(`请求 ${index + 1}: ${result.value.status} ${result.value.statusText}`)
    } else {
      console.log(`请求 ${index + 1}: 失败 - ${result.reason}`)
    }
  })

} catch (error) {
  console.error('测试请求失败:', error)
} finally {
  console.log('\n🛑 关闭服务器...')
  server.kill()
  process.exit(0)
}
