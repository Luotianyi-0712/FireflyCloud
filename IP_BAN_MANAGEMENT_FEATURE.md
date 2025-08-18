# 🚫 IP封禁管理功能实现

## 📋 功能概述

实现了针对直链访问的IP封禁管理功能，用户可以在直链管理页面中封禁和解封指定IP地址，提供更精细的访问控制。

### 主要功能
1. **IP封禁**: 在访问日志中一键封禁恶意IP
2. **封禁管理**: 查看、管理所有封禁的IP地址
3. **解封功能**: 支持解封已封禁的IP
4. **封禁原因**: 可选择性添加封禁原因
5. **实时生效**: 封禁后立即阻止该IP访问直链

## 🔧 技术实现

### 1. 数据库设计

#### 新增IP封禁表
```sql
CREATE TABLE ip_bans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,                    -- 执行封禁的用户ID
  direct_link_id TEXT,                      -- 关联的直链ID，NULL为全局封禁
  ip_address TEXT NOT NULL,                 -- 被封禁的IP地址
  reason TEXT,                              -- 封禁原因（可选）
  enabled INTEGER NOT NULL DEFAULT 1,       -- 是否启用封禁
  created_at INTEGER NOT NULL,              -- 创建时间
  updated_at INTEGER NOT NULL,              -- 更新时间
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (direct_link_id) REFERENCES file_direct_links (id) ON DELETE CASCADE
);
```

#### 特性
- 支持针对特定直链的封禁（direct_link_id 有值）
- 支持全局封禁（direct_link_id 为 NULL）
- 软删除设计（enabled 字段控制是否生效）
- 级联删除（用户或直链删除时自动清理相关封禁记录）

### 2. 后端实现

#### IP封禁服务
**文件**: `backend/src/services/ip-ban.ts`

**核心方法**:
```typescript
class IPBanService {
  // 检查IP是否被封禁
  static async isIPBanned(ipAddress: string, directLinkId?: string): Promise<boolean>
  
  // 封禁IP
  static async banIP(userId: string, ipAddress: string, directLinkId?: string, reason?: string): Promise<IPBanInfo>
  
  // 解封IP
  static async unbanIP(banId: string, userId: string): Promise<boolean>
  
  // 获取用户的IP封禁列表
  static async getUserIPBans(userId: string, directLinkId?: string): Promise<IPBanInfo[]>
  
  // 删除IP封禁记录
  static async deleteIPBan(banId: string, userId: string): Promise<boolean>
}
```

#### 直链访问控制
**文件**: `backend/src/routes/download.ts`

在直链访问路由中添加IP封禁检查：
```typescript
// 检查IP是否被封禁
const clientIP = getClientIP(headers)
const isIPBanned = await IPBanService.isIPBanned(clientIP, linkRecord.id)

if (isIPBanned) {
  logger.warn(`IP已被封禁，拒绝访问: ${clientIP} - 直链: ${params.filename}`)
  set.status = 403
  return { error: "Access denied: IP banned" }
}
```

#### API端点
**文件**: `backend/src/routes/direct-links.ts`

新增API端点：
- `POST /direct-links/:linkId/ban-ip` - 封禁IP
- `DELETE /direct-links/:linkId/ban-ip/:banId` - 解封IP
- `GET /direct-links/:linkId/banned-ips` - 获取封禁IP列表

### 3. 前端实现

#### 直链管理页面更新
**文件**: `app/direct-links/page.tsx`

**新增功能**:
1. **IP封禁标签页**: 在直链详情对话框中添加第三个标签页
2. **访问日志操作**: 在访问日志表格中添加封禁按钮
3. **封禁对话框**: 提供IP地址输入和封禁原因填写
4. **封禁列表**: 显示所有已封禁的IP及其状态

#### 用户界面组件
```typescript
// 新增状态
const [bannedIPs, setBannedIPs] = useState<IPBan[]>([])
const [banDialogOpen, setBanDialogOpen] = useState(false)
const [ipToBan, setIpToBan] = useState("")
const [banReason, setBanReason] = useState("")

// 新增功能函数
const handleBanIP = async () => { /* 封禁IP */ }
const handleUnbanIP = async (banId: string) => { /* 解封IP */ }
const handleBanIPFromLog = (ipAddress: string) => { /* 从日志封禁IP */ }
```

## 📊 功能特性

### 1. 访问控制
- **实时检查**: 每次直链访问都会检查IP是否被封禁
- **精确匹配**: 基于完整IP地址进行匹配
- **即时生效**: 封禁后立即阻止访问，无需重启服务

### 2. 管理界面
- **一键封禁**: 在访问日志中直接点击封禁按钮
- **批量管理**: 查看所有封禁IP的列表
- **状态显示**: 清晰显示封禁状态和时间
- **原因记录**: 可选择性记录封禁原因

### 3. 用户体验
- **直观操作**: 简单的点击操作完成封禁/解封
- **即时反馈**: 操作后立即更新界面状态
- **错误处理**: 完善的错误提示和异常处理

## 🔒 安全特性

### 1. 权限控制
- **用户隔离**: 用户只能管理自己直链的IP封禁
- **操作验证**: 所有操作都需要验证用户权限
- **数据保护**: 防止跨用户数据访问

### 2. 防滥用
- **合理限制**: 避免过度封禁影响正常用户
- **日志记录**: 完整记录封禁操作日志
- **可逆操作**: 支持解封，避免误封的永久影响

### 3. 数据完整性
- **外键约束**: 确保数据关联的完整性
- **级联删除**: 自动清理相关数据
- **事务安全**: 确保操作的原子性

## 🎨 用户界面

### 1. 访问日志增强
- 在每行访问记录后添加封禁按钮
- 使用红色图标表示封禁操作
- 悬停提示操作说明

### 2. IP封禁标签页
- 显示所有已封禁的IP列表
- 提供封禁状态、原因、时间等信息
- 支持一键解封操作

### 3. 封禁对话框
- 简洁的IP地址输入框
- 可选的封禁原因输入
- 清晰的操作按钮和取消选项

## 📡 API接口

### IP封禁管理
```typescript
// 封禁IP
POST /direct-links/:linkId/ban-ip
Body: { ipAddress: string, reason?: string }
Response: { success: boolean, ban: IPBanInfo }

// 解封IP
DELETE /direct-links/:linkId/ban-ip/:banId
Response: { success: boolean }

// 获取封禁IP列表
GET /direct-links/:linkId/banned-ips
Response: { bans: IPBanInfo[] }
```

### 数据结构
```typescript
interface IPBanInfo {
  id: string
  userId: string
  directLinkId: string | null
  ipAddress: string
  reason: string | null
  enabled: boolean
  createdAt: number
  updatedAt: number
}
```

## 🔄 数据流程

### 1. 封禁流程
```
用户点击封禁 → 填写信息 → 发送API请求 → 创建封禁记录 → 更新界面
```

### 2. 访问检查流程
```
直链访问 → 获取客户端IP → 检查封禁状态 → 允许/拒绝访问
```

### 3. 解封流程
```
用户点击解封 → 确认操作 → 发送API请求 → 更新封禁状态 → 刷新列表
```

## 🚀 部署说明

### 1. 数据库迁移
- 自动检测并创建 `ip_bans` 表
- 兼容现有数据结构
- 无需手动迁移

### 2. 功能启用
- 重启后端服务后立即生效
- 前端页面自动加载新功能
- 无需额外配置

### 3. 性能影响
- 每次直链访问增加一次数据库查询
- 查询使用索引优化，性能影响微小
- 建议定期清理过期封禁记录

## 🎉 使用说明

### 1. 封禁IP
1. 进入直链管理页面
2. 点击直链的"详情"按钮
3. 切换到"访问日志"标签页
4. 在恶意IP记录后点击封禁按钮
5. 填写封禁原因（可选）并确认

### 2. 管理封禁
1. 在直链详情中切换到"IP封禁"标签页
2. 查看所有已封禁的IP列表
3. 点击解封按钮可以解除封禁

### 3. 手动封禁
1. 在"IP封禁"标签页点击"封禁IP"按钮
2. 手动输入要封禁的IP地址
3. 填写封禁原因并确认

## ✨ 总结

IP封禁管理功能为FireflyCloud提供了更强大的访问控制能力：

✅ **精确控制** - 针对特定IP的精确封禁
✅ **简单易用** - 直观的操作界面和流程
✅ **实时生效** - 封禁后立即阻止恶意访问
✅ **完整管理** - 封禁、解封、查看的完整功能
✅ **安全可靠** - 完善的权限控制和数据保护

用户现在可以更有效地保护自己的文件直链，防止恶意访问和滥用，提升整体的安全性和使用体验。
