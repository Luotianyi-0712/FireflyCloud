# 下载令牌多次使用功能说明

## 功能概述

FireflyCloud 现在支持下载令牌多次使用功能。每个下载令牌默认可以使用 **2次**，而不是之前的一次性使用。这样可以提高用户体验，避免因为网络问题或其他原因导致的下载失败需要重新获取令牌的问题。

## 主要改进

### 1. 数据库结构升级

在 `download_tokens` 表中新增了两个字段：

- **`usage_count`**: 使用次数计数器（默认值：0）
- **`max_usage`**: 最大使用次数（默认值：2）

### 2. 向后兼容

- 保留了原有的 `used` 布尔字段以确保向后兼容
- 旧数据会在迁移时自动转换为新的计数器格式
- 新的逻辑优先使用计数器，但会兼容旧的布尔字段

### 3. 智能使用次数管理

- 每次下载时 `usage_count` 增加 1
- 当 `usage_count >= max_usage` 时，令牌被标记为已用完
- 同时更新 `used` 字段以保持兼容性

## 技术实现

### 数据库迁移

运行迁移脚本添加新字段：

```bash
cd backend
bun run migrate-download-tokens-usage.js
```

### 下载逻辑更新

#### 令牌验证逻辑
```javascript
// 检查令牌使用次数
const usageCount = tokenRecord.usageCount || 0
const maxUsage = tokenRecord.maxUsage || 2

// 兼容旧数据
const actualUsageCount = tokenRecord.used && usageCount === 0 ? maxUsage : usageCount

if (actualUsageCount >= maxUsage) {
  return { error: "Download token usage limit exceeded" }
}
```

#### 使用次数更新
```javascript
// 增加使用次数
const newUsageCount = actualUsageCount + 1
await db.update(downloadTokens).set({ 
  usageCount: newUsageCount,
  used: newUsageCount >= maxUsage // 兼容旧字段
})
```

### 令牌生成更新

新生成的令牌包含使用次数字段：

```javascript
await db.insert(downloadTokens).values({
  // ... 其他字段
  usageCount: 0,  // 初始使用次数
  maxUsage: 2,    // 最大使用次数
})
```

## 使用场景

### 1. 正常下载流程

1. 用户点击下载按钮
2. 前端获取下载令牌
3. 用户可以使用该令牌下载文件最多 2 次
4. 第 3 次使用时会收到 "Download token usage limit exceeded" 错误

### 2. 网络问题重试

- 如果第一次下载因网络问题失败，用户可以重试
- 无需重新获取令牌，直接使用相同的下载链接
- 提高了用户体验和系统的容错性

### 3. 分享文件下载

- 分享链接生成的下载令牌同样支持 2 次使用
- 接收者可以重试下载而无需重新获取链接

## 配置选项

### 自定义最大使用次数

可以在生成令牌时自定义最大使用次数：

```javascript
await db.insert(downloadTokens).values({
  // ... 其他字段
  maxUsage: 3,  // 自定义为3次
})
```

### 环境变量配置（未来功能）

计划支持通过环境变量配置默认最大使用次数：

```bash
# 未来功能
DOWNLOAD_TOKEN_MAX_USAGE=3
```

## 监控和日志

### 使用次数日志

下载成功时会记录使用次数信息：

```
文件下载成功: example.pdf - 用户: user123 - 令牌: token456 - 使用次数: 1/2
```

### 使用次数统计

可以通过数据库查询获取令牌使用统计：

```sql
-- 查看令牌使用情况
SELECT 
  usage_count,
  max_usage,
  COUNT(*) as count
FROM download_tokens 
GROUP BY usage_count, max_usage;

-- 查看已用完的令牌
SELECT COUNT(*) as exhausted_tokens
FROM download_tokens 
WHERE usage_count >= max_usage;
```

## 测试

### 自动化测试

运行测试脚本验证功能：

```bash
cd backend
bun run test-download-tokens-usage.js
```

### 手动测试

使用认证令牌和文件ID进行手动测试：

```bash
cd backend
bun run test-download-tokens-usage.js "your_auth_token" "your_file_id"
```

### 测试步骤

1. 获取下载令牌
2. 第一次下载 - 应该成功
3. 第二次下载 - 应该成功
4. 第三次下载 - 应该失败并返回使用次数超限错误

## 安全考虑

### 1. 令牌过期时间

- 令牌仍然有 5 分钟的过期时间
- 即使允许多次使用，过期后也无法使用

### 2. 使用次数限制

- 默认限制为 2 次，防止令牌被滥用
- 可以根据需要调整最大使用次数

### 3. 用户隔离

- 令牌仍然绑定到特定用户和文件
- 不同用户无法使用他人的令牌

## 向后兼容性

### 旧客户端支持

- 旧版本的客户端仍然可以正常工作
- `used` 字段会在令牌用完时自动设置为 `true`

### 数据迁移

- 现有的下载令牌会自动迁移
- `used=true` 的令牌会被标记为已用完（`usage_count=max_usage`）
- `used=false` 的令牌保持可用状态（`usage_count=0`）

## 未来计划

- [ ] 支持环境变量配置默认最大使用次数
- [ ] 添加管理员界面查看令牌使用统计
- [ ] 支持不同文件类型的不同使用次数限制
- [ ] 添加令牌使用次数的 API 查询接口
