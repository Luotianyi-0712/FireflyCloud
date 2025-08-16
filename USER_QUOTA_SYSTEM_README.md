# 用户容量配额系统实现说明

## 功能概述

本次更新实现了完整的用户存储容量配额管理系统，包括：

1. **去除R2统计中的数据库文本显示** ✅
2. **按用户组分配存储容量配额** ✅
   - 管理员默认：10GB
   - 普通用户默认：1GB
3. **文件上传时的容量检查** ✅
4. **管理面板中的配额管理界面** ✅
5. **用户界面中的容量使用显示** ✅

## 数据库设计

### 新增表结构

#### 1. user_quotas (用户配额表)
```sql
CREATE TABLE user_quotas (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  max_storage INTEGER NOT NULL,        -- 最大存储容量（字节）
  used_storage INTEGER DEFAULT 0,      -- 已使用存储（字节）
  role TEXT DEFAULT 'user',            -- 用户角色
  custom_quota INTEGER,                -- 自定义配额（可选）
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
```

#### 2. role_quota_config (角色配额配置表)
```sql
CREATE TABLE role_quota_config (
  id TEXT PRIMARY KEY,
  role TEXT UNIQUE NOT NULL,           -- 角色名称（admin/user）
  default_quota INTEGER NOT NULL,     -- 默认配额（字节）
  description TEXT,                   -- 配额描述
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### 自动初始化

系统启动时自动：
1. 创建表结构
2. 初始化默认角色配额：
   - admin: 10GB (10,737,418,240 字节)
   - user: 1GB (1,073,741,824 字节)
3. 为现有用户创建配额记录
4. 计算用户当前存储使用量

## 后端实现

### 1. QuotaService 配额服务

#### 核心方法
- `checkUserQuota()`: 检查用户配额是否足够
- `updateUserStorage()`: 更新用户存储使用量
- `recalculateUserStorage()`: 重新计算用户实际使用量
- `createUserQuota()`: 为用户创建配额记录
- `getUserQuota()`: 获取用户配额信息

#### 使用示例
```typescript
// 检查配额
const quotaCheck = await QuotaService.checkUserQuota(userId, fileSize)
if (!quotaCheck.allowed) {
  return { error: "Storage quota exceeded" }
}

// 更新使用量
await QuotaService.updateUserStorage(userId, fileSize)
```

### 2. API 接口

#### 管理员接口 (`/admin`)
- `GET /user-quotas`: 获取所有用户配额
- `PUT /user-quotas/:userId`: 更新用户配额
- `GET /role-quota-config`: 获取角色默认配额
- `PUT /role-quota-config/:role`: 更新角色默认配额
- `POST /recalculate-user-storage/:userId`: 重新计算单个用户
- `POST /recalculate-all-storage`: 批量重新计算所有用户

#### 用户接口 (`/auth`)
- `GET /quota`: 获取当前用户的配额信息

### 3. 文件上传集成

在文件上传时自动进行配额检查：

```typescript
// 检查用户配额
const quotaCheck = await QuotaService.checkUserQuota(user.userId, file.size)
if (!quotaCheck.allowed) {
  set.status = 413 // Payload Too Large
  return { 
    error: "Storage quota exceeded",
    details: {
      fileSize: file.size,
      currentUsed: quotaCheck.currentUsed,
      maxStorage: quotaCheck.maxStorage,
      availableSpace: quotaCheck.availableSpace
    }
  }
}

// 上传成功后更新使用量
await QuotaService.updateUserStorage(user.userId, file.size)
```

## 前端实现

### 1. 管理面板 - 配额管理

#### QuotaManagement 组件特性
- **角色配额配置**: 设置管理员和用户的默认配额
- **用户配额管理**: 查看和编辑所有用户的配额
- **使用情况可视化**: 进度条显示使用率
- **批量操作**: 重新计算所有用户存储使用量
- **实时更新**: 支持手动刷新和重新计算

#### 界面功能
- 角色配额卡片显示
- 用户配额表格管理
- 编辑对话框
- 进度条和使用率显示
- 操作按钮（编辑、重新计算）

### 2. 用户界面 - 配额显示

#### QuotaDisplay 组件特性
- **实时配额信息**: 显示当前使用量和总容量
- **可视化进度条**: 直观显示使用率
- **状态提示**: 根据使用率显示不同的警告信息
- **角色标识**: 显示用户角色（管理员/普通用户）
- **详细信息**: 已用、剩余空间的详细数据

#### 状态提示逻辑
- **95%以上**: 红色警告，提示空间即将用完
- **85-95%**: 黄色提醒，建议清理文件
- **50%以下**: 绿色提示，空间充足

### 3. 集成到文件管理器

配额显示组件已集成到文件管理器的侧边栏中，与文件夹树并列显示。

## 使用流程

### 管理员操作

#### 1. 设置角色默认配额
1. 进入管理面板 → 配额管理
2. 在"角色默认配额配置"区域点击编辑按钮
3. 设置管理员或用户的默认配额
4. 保存更改

#### 2. 管理用户配额
1. 在"用户存储配额管理"表格中查看所有用户
2. 点击编辑按钮修改特定用户的配额
3. 可设置自定义配额覆盖默认配额
4. 使用重新计算按钮更新实际使用量

#### 3. 批量操作
- 点击"重新计算全部"按钮批量更新所有用户的存储使用量
- 适用于数据迁移或修复不一致的情况

### 用户体验

#### 1. 查看配额信息
- 在文件管理界面的侧边栏查看配额使用情况
- 实时显示使用率和剩余空间

#### 2. 文件上传
- 上传文件时自动检查配额
- 超出配额时显示详细错误信息
- 成功上传后自动更新使用量

#### 3. 配额警告
- 使用率达到85%时显示提醒
- 使用率达到95%时显示严重警告
- 超出配额时无法上传新文件

## 技术特性

### 1. 自动化管理
- 数据库自动初始化和迁移
- 新用户自动创建配额记录
- 文件操作自动更新使用量

### 2. 数据一致性
- 支持重新计算实际使用量
- 处理数据不一致的情况
- 事务性操作保证数据完整性

### 3. 性能优化
- 配额检查在文件上传前进行
- 批量操作支持大量用户
- 缓存机制减少数据库查询

### 4. 错误处理
- 详细的错误信息和状态码
- 用户友好的错误提示
- 日志记录便于问题排查

## 配置说明

### 默认配额设置
- 管理员：10GB (可在角色配额配置中修改)
- 普通用户：1GB (可在角色配额配置中修改)

### 自定义配额
- 管理员可为特定用户设置自定义配额
- 自定义配额优先级高于角色默认配额
- 支持设置为空以使用默认配额

### 容量单位
- 后端存储：字节 (bytes)
- 前端显示：自动转换为合适的单位 (KB/MB/GB/TB)
- 配置界面：GB 输入，自动转换为字节

## 监控和维护

### 1. 使用量监控
- 管理面板实时显示所有用户使用情况
- 进度条可视化使用率
- 支持按使用率排序和筛选

### 2. 数据维护
- 重新计算功能修复数据不一致
- 批量操作支持大规模数据维护
- 详细日志记录所有操作

### 3. 容量规划
- 统计信息帮助规划存储容量
- 使用趋势分析
- 配额调整建议

## 安全考虑

### 1. 权限控制
- 只有管理员可以修改配额设置
- 用户只能查看自己的配额信息
- API 接口都有权限验证

### 2. 数据验证
- 配额值范围验证
- 文件大小检查
- 用户身份验证

### 3. 操作审计
- 所有配额操作都有日志记录
- 包含操作者、时间、变更内容
- 便于安全审计和问题追踪

## 后续扩展

- [ ] 配额使用趋势图表
- [ ] 自动配额调整策略
- [ ] 配额告警通知
- [ ] 文件类型配额限制
- [ ] 临时配额增加功能
- [ ] 配额使用报告导出
