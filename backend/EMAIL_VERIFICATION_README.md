# 邮箱验证功能说明

## 功能概述

FireflyCloud 支持可选的邮箱验证码注册功能：
- **SMTP 启用时**: 用户注册需要邮箱验证码
- **SMTP 禁用时**: 用户可直接使用邮箱+密码注册，无需验证码

## SMTP 配置方式

### 方式一：管理面板配置（推荐）

1. 启动服务后，使用管理员账户登录
2. 进入管理面板 → 邮件配置
3. 在界面中配置 SMTP 服务器信息
4. 支持自定义邮件模板和实时预览
5. 可以发送测试邮件验证配置

### 方式二：环境变量配置

在 `.env` 文件中配置以下参数：

```env
# JWT Secret - 必须配置
JWT_SECRET=your-secret-key

# Database - 必须配置
DATABASE_URL=./netdisk.db

# SMTP Configuration - 可选，也可在管理面板配置
SMTP_HOST=your_smtp_host
SMTP_PORT=465
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_password
```

### 配置优先级

1. 如果管理面板中启用了 SMTP 配置，优先使用管理面板配置
2. 如果管理面板中未启用，则使用环境变量配置
3. 如果都没有配置，邮件功能将不可用

### 配置步骤

1. 复制 `.env.example` 文件为 `.env`：
   ```bash
   cp .env.example .env
   ```

2. 编辑 `.env` 文件，至少配置 JWT_SECRET 和 DATABASE_URL

3. 启动服务，系统会自动创建数据库表

4. 登录管理面板配置 SMTP 或在环境变量中配置

## API 接口

### 1. 检查 SMTP 状态

**GET** `/auth/smtp-status`

响应：
```json
{
  "enabled": true
}
```

### 2. 发送验证码（仅在 SMTP 启用时可用）

**POST** `/auth/send-verification-code`

请求体：
```json
{
  "email": "user@example.com"
}
```

响应：
```json
{
  "success": true,
  "message": "验证码已发送到您的邮箱，请查收",
  "expiresIn": 600
}
```

错误响应（SMTP 未启用）：
```json
{
  "error": "邮件服务未启用，无法发送验证码"
}
```

### 3. 注册用户（支持两种模式）

**POST** `/auth/register`

**SMTP 启用时的请求体**：
```json
{
  "email": "user@example.com",
  "password": "password123",
  "verificationCode": "123456"
}
```

**SMTP 禁用时的请求体**：
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

响应：
```json
{
  "token": "jwt_token_here",
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "role": "user",
    "emailVerified": true
  }
}
```

## 数据库变更

### 用户表新增字段
- `email_verified`: 邮箱验证状态 (0/1)

### 新增验证码表
```sql
CREATE TABLE email_verification_codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);
```

## 邮件模板

系统使用HTML邮件模板，包含：
- FireflyCloud 品牌标识
- 6位数验证码
- 10分钟有效期提醒
- 安全提示

## 管理面板功能

### SMTP 配置界面
- **基础设置**: 配置 SMTP 服务器、端口、用户名、密码等
- **邮件模板**: 自定义 HTML 邮件模板，支持实时预览
- **测试发送**: 发送测试邮件验证配置是否正确
- **配置检查**: 实时显示配置状态

### 邮件模板功能
- 支持 HTML 格式的邮件模板
- 使用 `{{CODE}}` 作为验证码占位符
- 实时预览功能，可以看到邮件效果
- 可以重置为默认模板

## 前端集成

### 动态注册界面
注册页面会根据 SMTP 配置状态自动调整：

**SMTP 启用时显示**：
- 邮箱输入框 + 发送验证码按钮
- 验证码输入框
- 60秒倒计时功能
- 密码和确认密码输入框

**SMTP 禁用时显示**：
- 邮箱输入框（无发送按钮）
- 密码和确认密码输入框
- 无验证码相关功能

### 状态检查
- 页面加载时自动检查 SMTP 状态
- 显示相应的提示信息
- 动态调整表单验证规则

## 测试

### 管理面板测试
1. 登录管理面板
2. 进入邮件配置 → 测试发送
3. 输入测试邮箱地址
4. 点击发送测试邮件

### API 测试
```bash
# 测试发送验证码
curl -X POST http://localhost:8080/auth/send-verification-code \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

## 安全特性

1. **验证码过期**: 10分钟自动过期
2. **一次性使用**: 验证码使用后立即失效
3. **邮箱唯一性**: 防止重复注册
4. **频率限制**: 60秒内只能发送一次验证码
