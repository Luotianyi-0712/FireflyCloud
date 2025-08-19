# R2上传错误排查指南

## 🚨 错误分析

您遇到的 `SignatureDoesNotMatch` 错误通常由以下原因导致：

### 1. **文件名编码问题** ⭐ 最可能的原因
- **问题**: 文件名包含中文字符 `屏幕截图 2025-06-15 171844.png`
- **影响**: URL编码后的文件名过长，导致AWS签名计算错误
- **解决**: 已在代码中添加文件名清理逻辑

### 2. **R2配置错误**
- Access Key 或 Secret Key 不正确
- R2端点URL配置错误
- 存储桶名称错误

### 3. **时间同步问题**
- 服务器时间与AWS时间不同步
- 可能导致签名时间戳验证失败

## 🔧 已实施的修复

### 1. **文件名清理**
```javascript
// 新增的路径清理函数
private sanitizeR2Path(path: string): string {
  return path
    .replace(/[^\w\-_.\/\u4e00-\u9fff]/g, '_') // 保留中文，替换特殊字符
    .replace(/\/+/g, '/') // 合并多个斜杠
    .replace(/^\//, '') // 移除开头斜杠
}
```

### 2. **增强的错误处理**
- 添加详细的调试日志
- 验证R2配置完整性
- 更好的错误信息

### 3. **S3客户端优化**
```javascript
new S3Client({
  region: "auto",
  endpoint: config.r2Endpoint,
  credentials: {
    accessKeyId: config.r2AccessKey,
    secretAccessKey: config.r2SecretKey,
  },
  forcePathStyle: true, // 新增：强制路径样式
})
```

## 🧪 测试步骤

### 1. **运行R2配置测试**
```bash
cd backend
node test-r2-config.js
```

### 2. **检查R2配置**
在管理面板中验证以下配置：
- ✅ R2端点URL (格式: `https://[account-id].r2.cloudflarestorage.com`)
- ✅ Access Key ID
- ✅ Secret Access Key  
- ✅ 存储桶名称

### 3. **验证存储桶权限**
确保API令牌具有以下权限：
- `Object:Read`
- `Object:Write`
- `Object:Delete`

## 🔍 故障排除清单

### ✅ 基础检查
- [ ] R2配置是否完整
- [ ] 存储桶是否存在
- [ ] API令牌权限是否正确
- [ ] 服务器时间是否同步

### ✅ 文件名检查
- [ ] 文件名是否包含特殊字符
- [ ] 文件名长度是否合理
- [ ] 路径是否包含非法字符

### ✅ 网络检查
- [ ] 服务器是否能访问Cloudflare R2
- [ ] 防火墙是否阻止HTTPS连接
- [ ] DNS解析是否正常

## 🛠️ 手动验证R2配置

### 1. **使用AWS CLI测试**
```bash
# 配置AWS CLI
aws configure set aws_access_key_id YOUR_R2_ACCESS_KEY
aws configure set aws_secret_access_key YOUR_R2_SECRET_KEY
aws configure set region auto

# 测试连接
aws s3 ls --endpoint-url https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
```

### 2. **使用curl测试**
```bash
# 简单的GET请求测试
curl -H "Authorization: Bearer YOUR_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/YOUR_ACCOUNT_ID/r2/buckets"
```

## 📊 常见错误代码

| 错误代码 | 原因 | 解决方案 |
|---------|------|----------|
| `SignatureDoesNotMatch` | 签名计算错误 | 检查密钥、时间同步、文件名编码 |
| `NoSuchBucket` | 存储桶不存在 | 验证存储桶名称 |
| `AccessDenied` | 权限不足 | 检查API令牌权限 |
| `InvalidAccessKeyId` | Access Key错误 | 重新生成API令牌 |

## 🎯 下一步操作

1. **重新测试上传**
   - 尝试上传英文文件名的文件
   - 检查是否还有签名错误

2. **查看详细日志**
   - 检查后端日志中的R2配置信息
   - 确认文件名清理是否生效

3. **验证R2控制台**
   - 登录Cloudflare R2控制台
   - 检查存储桶设置和权限

## 💡 预防措施

1. **文件名规范**
   - 避免使用特殊字符
   - 限制文件名长度
   - 使用英文和数字

2. **定期检查**
   - 定期验证R2配置
   - 监控上传错误率
   - 及时更新API令牌

3. **备用方案**
   - 配置本地存储作为备用
   - 实现自动重试机制
   - 添加用户友好的错误提示

修复后，请重新尝试上传文件，特别是测试包含中文字符的文件名。
