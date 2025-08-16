// 测试自动域名检测功能（优先自动检测）
const { getBaseUrl, getFrontendUrl } = require('./dist/utils/url.js')

console.log('🧪 测试自动域名检测功能（优先自动检测）\n')

// 模拟 nginx 反向代理的请求头
const nginxHeaders = {
  'x-forwarded-proto': 'https',
  'x-forwarded-host': 'pan-backend.cialloo.site',
  'host': 'localhost:8080',
  'referer': 'https://pan.cialloo.site/dashboard'
}

// 模拟开发环境的请求头
const devHeaders = {
  'host': 'localhost:8080',
  'referer': 'http://localhost:3000/dashboard'
}

// 模拟最小请求头（只有 Host）
const minimalHeaders = {
  'host': 'api.example.com'
}

// 模拟 HTTPS 请求头
const httpsHeaders = {
  'x-forwarded-ssl': 'on',
  'host': 'secure.example.com',
  'referer': 'https://app.example.com/share'
}

console.log('📋 测试场景 1: nginx 反向代理 (HTTPS)')
console.log('请求头:', JSON.stringify(nginxHeaders, null, 2))
console.log('后端URL:', getBaseUrl(nginxHeaders))
console.log('前端URL:', getFrontendUrl(nginxHeaders))
console.log('')

console.log('📋 测试场景 2: 开发环境 (HTTP)')
console.log('请求头:', JSON.stringify(devHeaders, null, 2))
console.log('后端URL:', getBaseUrl(devHeaders))
console.log('前端URL:', getFrontendUrl(devHeaders))
console.log('')

console.log('📋 测试场景 3: 最小请求头')
console.log('请求头:', JSON.stringify(minimalHeaders, null, 2))
console.log('后端URL:', getBaseUrl(minimalHeaders))
console.log('前端URL:', getFrontendUrl(minimalHeaders))
console.log('')

console.log('📋 测试场景 4: HTTPS 检测')
console.log('请求头:', JSON.stringify(httpsHeaders, null, 2))
console.log('后端URL:', getBaseUrl(httpsHeaders))
console.log('前端URL:', getFrontendUrl(httpsHeaders))
console.log('')

console.log('✅ 测试完成！')
console.log('')
console.log('📝 说明:')
console.log('- 现在系统会优先使用自动检测的域名')
console.log('- 只有在自动检测失败时才使用环境变量')
console.log('- 支持多种反向代理头格式')
console.log('- 自动识别 HTTP/HTTPS 协议')
