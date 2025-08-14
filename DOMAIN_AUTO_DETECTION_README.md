# 自动域名检测功能说明

## 功能概述

FireflyCloud 现在支持自动域名检测功能，无需硬编码域名即可正确生成下载链接、直链和分享链接。这个功能特别适用于使用 nginx 反向代理的部署场景。

## 主要特性

### 1. 自动后端域名检测
- **环境变量优先**: 如果设置了 `BACKEND_URL` 环境变量，优先使用
- **反向代理支持**: 自动检测 nginx 等反向代理的请求头
- **协议自动判断**: 支持 HTTP 和 HTTPS 协议自动检测
- **开发环境兼容**: 开发环境自动回退到 localhost

### 2. 自动前端域名检测
- **环境变量优先**: 如果设置了 `FRONTEND_URL` 环境变量，优先使用
- **Referer 检测**: 从请求的 Referer 或 Origin 头获取前端域名
- **智能推测**: 开发环境自动推测前端地址

## 支持的反向代理头

系统会自动检测以下 HTTP 头信息：

### 协议检测
- `X-Forwarded-Proto`: 标准的协议转发头
- `X-Forwarded-Protocol`: 协议转发头的变体
- `X-Forwarded-SSL`: SSL 状态检测
- `X-Forwarded-Scheme`: 协议方案检测

### 主机名检测
- `X-Forwarded-Host`: 标准的主机名转发头
- `X-Forwarded-Server`: 服务器名转发头
- `Host`: 标准的 HTTP Host 头

## 使用场景

### 1. nginx 反向代理配置
```nginx
server {
    listen 443 ssl;
    server_name pan-backend.cialloo.site;
    
    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
    }
}
```

### 2. 环境变量配置

#### 开发环境
```bash
# 可以不设置，系统会自动检测
# BACKEND_URL=http://localhost:8080
# FRONTEND_URL=http://localhost:3000
```

#### 生产环境（推荐）
```bash
# 明确指定域名（推荐）
BACKEND_URL=https://pan-backend.cialloo.site
FRONTEND_URL=https://pan.cialloo.site
```

#### 生产环境（自动检测）
```bash
# 留空让系统自动检测（适用于反向代理）
# BACKEND_URL=
# FRONTEND_URL=
```

## 检测逻辑

### 后端 URL 检测顺序
1. 检查 `BACKEND_URL` 环境变量
2. 从 `X-Forwarded-Proto` 和 `X-Forwarded-Host` 构建 URL
3. 从 `Host` 头和其他代理头构建 URL
4. 回退到 `http://localhost:8080`

### 前端 URL 检测顺序
1. 检查 `FRONTEND_URL` 环境变量
2. 从 `Referer` 或 `Origin` 头提取域名
3. 开发环境推测为 `http://localhost:3000`
4. 回退到后端 URL

## 生成的链接类型

### 1. 下载链接
- **格式**: `{后端域名}/files/download/{token}`
- **示例**: `https://pan-backend.cialloo.site/files/download/abc123`

### 2. 直链
- **格式**: `{后端域名}/files/direct/{filename}`
- **示例**: `https://pan-backend.cialloo.site/files/direct/document.pdf`

### 3. 分享链接
- **格式**: `{前端域名}/share/{token}`
- **示例**: `https://pan.cialloo.site/share/xyz789`

## 日志记录

系统会记录域名检测过程，便于调试：

```
[DEBUG] 从 X-Forwarded-Proto 获取协议: https
[DEBUG] 从 X-Forwarded-Host 获取主机名: pan-backend.cialloo.site
[DEBUG] 自动构建的基础URL: https://pan-backend.cialloo.site
```

## 最佳实践

### 1. 生产环境
- **推荐**: 明确设置 `BACKEND_URL` 和 `FRONTEND_URL` 环境变量
- **备选**: 配置正确的反向代理头，让系统自动检测

### 2. 开发环境
- 可以不设置环境变量，系统会自动使用 localhost
- 确保前后端端口正确（前端 3000，后端 8080）

### 3. 反向代理配置
- 确保设置 `X-Forwarded-Proto` 和 `X-Forwarded-Host` 头
- 对于 HTTPS 部署，确保协议头正确传递

## 故障排除

### 1. 链接域名错误
- 检查反向代理配置是否正确设置转发头
- 检查环境变量是否正确配置
- 查看日志中的域名检测信息

### 2. 协议错误（HTTP/HTTPS）
- 确保 `X-Forwarded-Proto` 头正确设置
- 检查 SSL 相关的代理头配置

### 3. 开发环境问题
- 确保前端运行在 3000 端口
- 确保后端运行在 8080 端口
- 检查是否有端口冲突

## 兼容性

- **向后兼容**: 现有的环境变量配置继续有效
- **渐进增强**: 可以逐步从硬编码迁移到自动检测
- **多环境支持**: 同一套代码可以在不同环境中自动适配
