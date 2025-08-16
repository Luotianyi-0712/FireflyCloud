// 简单的自动检测测试
console.log('🧪 测试自动域名检测功能（优先自动检测）\n')

// 模拟函数（简化版本，用于测试逻辑）
function getBaseUrl(headers) {
  // 1. 优先从请求头中自动获取域名
  const forwardedProto = headers['x-forwarded-proto'] || headers['x-forwarded-protocol']
  const forwardedHost = headers['x-forwarded-host'] || headers['x-forwarded-server']
  const host = headers['host']

  let protocol = 'http'
  let hostname = 'localhost:8080'
  let autoDetected = false

  // 确定协议
  if (forwardedProto) {
    protocol = forwardedProto
    console.log(`从 X-Forwarded-Proto 获取协议: ${protocol}`)
    autoDetected = true
  } else if (headers['x-forwarded-ssl'] === 'on' || headers['x-forwarded-scheme'] === 'https') {
    protocol = 'https'
    console.log(`从其他代理头判断为 HTTPS 协议`)
    autoDetected = true
  }

  // 确定主机名
  if (forwardedHost) {
    hostname = forwardedHost
    console.log(`从 X-Forwarded-Host 获取主机名: ${hostname}`)
    autoDetected = true
  } else if (host) {
    hostname = host
    console.log(`从 Host 头获取主机名: ${hostname}`)
    autoDetected = true
  }

  // 如果自动检测成功，使用检测结果
  if (autoDetected) {
    const baseUrl = `${protocol}://${hostname}`
    console.log(`✅ 自动检测成功，使用基础URL: ${baseUrl}`)
    return baseUrl
  }

  // 2. 自动检测失败时，使用环境变量作为回退
  if (process.env.BACKEND_URL) {
    console.log(`⚠️ 自动检测失败，使用环境变量 BACKEND_URL: ${process.env.BACKEND_URL}`)
    return process.env.BACKEND_URL
  }

  // 3. 最后的回退方案
  const fallbackUrl = `${protocol}://${hostname}`
  console.log(`🔧 使用默认回退URL: ${fallbackUrl}`)
  return fallbackUrl
}

// 测试场景
console.log('📋 测试场景 1: nginx 反向代理 (HTTPS)')
const nginxHeaders = {
  'x-forwarded-proto': 'https',
  'x-forwarded-host': 'pan-backend.cialloo.site',
  'host': 'localhost:8080'
}
console.log('请求头:', JSON.stringify(nginxHeaders, null, 2))
const result1 = getBaseUrl(nginxHeaders)
console.log('结果:', result1)
console.log('')

console.log('📋 测试场景 2: 开发环境 (HTTP)')
const devHeaders = {
  'host': 'localhost:8080'
}
console.log('请求头:', JSON.stringify(devHeaders, null, 2))
const result2 = getBaseUrl(devHeaders)
console.log('结果:', result2)
console.log('')

console.log('📋 测试场景 3: 环境变量回退')
process.env.BACKEND_URL = 'https://api.example.com'
const minimalHeaders = {}
console.log('请求头:', JSON.stringify(minimalHeaders, null, 2))
const result3 = getBaseUrl(minimalHeaders)
console.log('结果:', result3)
console.log('')

console.log('📋 测试场景 4: HTTPS 检测')
const httpsHeaders = {
  'x-forwarded-ssl': 'on',
  'host': 'secure.example.com'
}
console.log('请求头:', JSON.stringify(httpsHeaders, null, 2))
const result4 = getBaseUrl(httpsHeaders)
console.log('结果:', result4)
console.log('')

console.log('✅ 测试完成！')
console.log('')
console.log('📝 修改说明:')
console.log('- ✅ 现在系统会优先使用自动检测的域名')
console.log('- ✅ 只有在自动检测失败时才使用环境变量')
console.log('- ✅ 支持多种反向代理头格式')
console.log('- ✅ 自动识别 HTTP/HTTPS 协议')
console.log('')
console.log('🔗 下载URL 现在会自动检测域名，无需配置环境变量！') 