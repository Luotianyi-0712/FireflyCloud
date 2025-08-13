# FireflyCloud 日志系统说明

## 概述

FireflyCloud 后端现在配备了完整的日志系统，支持分级日志、颜色显示、时间戳和专门的HTTP请求日志记录。

## 功能特性

### 🎨 日志分级与颜色
- **DEBUG** 🔍 - 调试信息（青色）
- **INFO** ℹ️ - 一般信息（亮绿色）
- **WARN** ⚠️ - 警告信息（亮黄色）
- **ERROR** ❌ - 错误信息（亮红色）
- **FATAL** 💀 - 致命错误（红色背景）

### 🌐 HTTP 请求日志
- 自动记录所有HTTP请求
- 显示请求方法、路径、状态码、响应时间
- 根据状态码显示不同颜色：
  - 2xx：绿色（成功）
  - 3xx：青色（重定向）
  - 4xx：黄色（客户端错误）
  - 5xx：红色（服务器错误）
- 根据响应时间显示颜色：
  - < 100ms：绿色（快速）
  - 100-500ms：黄色（中等）
  - > 500ms：红色（慢速）

### 💾 数据库操作日志
- 记录数据库操作类型和表名
- 显示操作耗时
- 错误时显示详细信息

### 📧 邮件发送日志
- 记录邮件发送状态
- 显示收件人和主题
- 成功/失败状态显示

### 📁 文件操作日志
- 记录文件上传、下载、删除操作
- 显示文件名和大小
- 自动格式化文件大小（B, KB, MB, GB）

### ⏰ 时间戳
- 精确到毫秒的时间戳
- 格式：YYYY-MM-DD HH:mm:ss.SSS

## 使用方法

### 基本日志记录

```typescript
import { logger } from '../utils/logger'

// 基本日志
logger.debug('调试信息')
logger.info('操作成功')
logger.warn('警告信息')
logger.error('错误信息')
logger.fatal('致命错误')
```

### HTTP 请求日志

```typescript
// HTTP请求日志（通常由中间件自动调用）
logger.http('GET', '/api/users', 200, 45.2, 'Mozilla/5.0...')
```

### 数据库操作日志

```typescript
// 数据库操作日志
logger.database('SELECT', 'users', 15.2)  // 成功操作
logger.database('INSERT', 'files', undefined, error)  // 失败操作
```

### 邮件发送日志

```typescript
// 邮件发送日志
logger.email('user@example.com', '验证码邮件', true)  // 成功
logger.email('user@example.com', '验证码邮件', false, error)  // 失败
```

### 文件操作日志

```typescript
// 文件操作日志
logger.file('UPLOAD', 'document.pdf', 2048576, true)  // 成功
logger.file('DELETE', 'old-file.txt', 512, false, error)  // 失败
```

## 配置选项

### 环境变量配置
- `NODE_ENV=production` - 生产环境下默认只显示INFO级别以上的日志
- `NODE_ENV=development` - 开发环境下显示所有级别的日志

### 代码配置

```typescript
import { logger, Logger, LogLevel } from '../utils/logger'

// 更新配置
logger.updateConfig({
  level: LogLevel.WARN,        // 只显示WARN及以上级别
  enableColors: false,         // 禁用颜色
  enableTimestamp: false,      // 禁用时间戳
  enableIcons: false          // 禁用图标
})

// 创建自定义日志实例
const customLogger = new Logger({
  level: LogLevel.ERROR,
  enableColors: true
})
```

## HTTP 中间件配置

HTTP日志中间件已自动集成到主应用中，支持以下配置：

```typescript
import { createLoggingMiddleware } from '../middleware/logging'

const customLoggingMiddleware = createLoggingMiddleware({
  enabled: true,                    // 启用日志
  logRequestBody: false,           // 记录请求体（生产环境建议关闭）
  logResponseBody: false,          // 记录响应体（生产环境建议关闭）
  logUserAgent: true,              // 记录用户代理
  logIpAddress: true,              // 记录IP地址
  logHeaders: false,               // 记录请求头（生产环境建议关闭）
  sensitiveHeaders: [              // 敏感头部字段（会被隐藏）
    'authorization',
    'cookie',
    'password'
  ],
  skipPaths: [                     // 跳过日志记录的路径
    '/health',
    '/favicon.ico'
  ],
  slowRequestThreshold: 1000       // 慢请求阈值（毫秒）
})
```

## 日志输出示例

```
[2024-01-15 14:30:25.123] INFO  ℹ️ 环境变量检查通过
[2024-01-15 14:30:25.124] INFO  🚀 正在启动 NetDisk API 服务器...
[2024-01-15 14:30:25.125] HTTP  🌐 GET    /api/users 200 45ms Mozilla/5.0...
[2024-01-15 14:30:25.126] DB    💾 SELECT users 15ms
[2024-01-15 14:30:25.127] EMAIL 📧 SENT to user@example.com - 验证码邮件
[2024-01-15 14:30:25.128] FILE  📁 UPLOAD document.pdf (2.00 MB)
[2024-01-15 14:30:25.129] WARN  ⚠️ 慢请求检测: GET /api/search took 1247ms
[2024-01-15 14:30:25.130] ERROR ❌ 文件上传失败: Disk space insufficient
```

## 性能考虑

- 日志系统经过优化，对性能影响最小
- 生产环境下自动调整日志级别
- 支持条件日志记录，避免不必要的字符串操作
- 敏感信息自动过滤

## 故障排除

### 日志不显示
1. 检查日志级别设置
2. 确认环境变量配置
3. 验证导入路径是否正确

### 颜色不显示
1. 确认终端支持ANSI颜色代码
2. 检查 `enableColors` 配置
3. 某些CI环境可能不支持颜色

### 性能问题
1. 在生产环境中提高日志级别
2. 禁用详细的请求/响应体日志
3. 调整慢请求阈值

## 测试

运行日志系统测试：

```bash
# 首先构建项目
cd backend
bun run build

# 运行测试脚本
node test-logger.js
```

这将展示所有日志功能的效果，包括不同级别、颜色和格式的日志输出。
