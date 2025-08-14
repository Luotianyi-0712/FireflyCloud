// 测试自动域名检测功能
const { getBaseUrl, getFrontendUrl } = require('./dist/utils/url.js')

console.log('🧪 测试自动域名检测功能\n')

// 测试场景1: nginx 反向代理 (你的实际场景)
console.log('📋 场景1: nginx 反向代理 (pan-backend.cialloo.site)')
const nginxHeaders = {
  'host': 'pan-backend.cialloo.site',
  'x-forwarded-proto': 'https',
  'x-forwarded-host': 'pan-backend.cialloo.site',
  'x-forwarded-for': '1.2.3.4',
  'referer': 'https://pan.cialloo.site/dashboard'
}

console.log('后端URL:', getBaseUrl(nginxHeaders))
console.log('前端URL:', getFrontendUrl(nginxHeaders))
console.log()

// 测试场景2: 开发环境
console.log('📋 场景2: 开发环境 (localhost)')
const devHeaders = {
  'host': 'localhost:8080',
  'referer': 'http://localhost:3000/dashboard'
}

console.log('后端URL:', getBaseUrl(devHeaders))
console.log('前端URL:', getFrontendUrl(devHeaders))
console.log()

// 测试场景3: 环境变量优先
console.log('📋 场景3: 环境变量优先')
process.env.BACKEND_URL = 'https://api.example.com'
process.env.FRONTEND_URL = 'https://app.example.com'

console.log('后端URL:', getBaseUrl(nginxHeaders))
console.log('前端URL:', getFrontendUrl(nginxHeaders))
console.log()

// 清理环境变量
delete process.env.BACKEND_URL
delete process.env.FRONTEND_URL

// 测试场景4: 最小头信息
console.log('📋 场景4: 最小头信息')
const minimalHeaders = {
  'host': 'example.com'
}

console.log('后端URL:', getBaseUrl(minimalHeaders))
console.log('前端URL:', getFrontendUrl(minimalHeaders))
console.log()

console.log('✅ 测试完成')
