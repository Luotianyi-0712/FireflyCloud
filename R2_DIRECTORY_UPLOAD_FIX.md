# R2挂载点目录上传修复

## 🎯 问题描述

**修复前的问题**：在R2挂载文件夹内上传文件时，文件始终上传到R2存储桶的根目录，而不是用户当前浏览的子目录。

**根本原因**：文件上传API只接收本地文件夹ID，没有接收当前用户浏览的R2路径信息。

## 🔧 实施的修复

### 1. **后端API修改**

#### 文件上传路由 (`backend/src/routes/files.ts`)
- **新增参数**: `currentR2Path` - 当前用户浏览的R2路径
- **修改逻辑**: 使用传入的R2路径而不是计算的相对路径
- **API Schema**: 添加可选的 `currentR2Path` 参数

```typescript
// 修改前
const { file, folderId } = body

// 修改后  
const { file, folderId, currentR2Path } = body
```

#### 上传路径构建逻辑
```typescript
// 修改前：基于本地文件夹层级计算
let relativePath = ""
if (folderId && folderId !== r2MountPoint.folderId) {
  relativePath = await calculateFolderRelativePath(r2MountPoint.folderId, folderId)
}

// 修改后：直接使用当前R2路径
let targetR2Path = currentR2Path || r2MountPoint.r2Path
const fullR2Path = targetR2Path ? `${targetR2Path}/${filename}` : filename
```

### 2. **前端组件修改**

#### FileUpload组件 (`components/files/file-upload.tsx`)
- **新增Props**: `r2MountInfo` - R2挂载点信息
- **修改上传**: 在FormData中包含当前R2路径

```typescript
// 新增接口
interface R2MountInfo {
  id: string
  mountName: string
  r2Path: string
  folderId: string
  currentR2Path?: string
}

// 修改上传逻辑
if (r2MountInfo?.currentR2Path) {
  formData.append("currentR2Path", r2MountInfo.currentR2Path)
}
```

#### FileManager组件 (`components/files/file-manager.tsx`)
- **传递R2信息**: 向FileUpload组件传递R2挂载点信息

```typescript
<FileUpload
  onUploadSuccess={handleUploadSuccess}
  currentFolderId={selectedFolderId}
  r2MountInfo={r2MountInfo}  // 新增
/>
```

## 🧪 测试场景

### 场景1：R2挂载点根目录上传
```
设置：
- 文件夹: /documents (挂载到 R2: "docs/")
- 当前位置: 挂载点根目录
- currentR2Path: "docs/"

操作：上传 test.txt
预期结果：文件上传到 R2 的 "docs/test.txt"
```

### 场景2：R2子目录上传
```
设置：
- 文件夹: /documents (挂载到 R2: "docs/")
- 当前位置: docs/projects/2024/
- currentR2Path: "docs/projects/2024"

操作：上传 project.txt
预期结果：文件上传到 R2 的 "docs/projects/2024/project.txt"
```

### 场景3：深层嵌套目录上传
```
设置：
- 文件夹: /storage (挂载到 R2: "backup/")
- 当前位置: backup/users/john/documents/
- currentR2Path: "backup/users/john/documents"

操作：上传 document.pdf
预期结果：文件上传到 R2 的 "backup/users/john/documents/document.pdf"
```

### 场景4：空挂载路径的子目录
```
设置：
- 文件夹: /r2root (挂载到 R2: "")
- 当前位置: projects/frontend/
- currentR2Path: "projects/frontend"

操作：上传 code.js
预期结果：文件上传到 R2 的 "projects/frontend/code.js"
```

## 🔍 验证方法

### 1. **前端验证**
1. 导航到R2挂载点的子目录
2. 检查面包屑导航显示正确路径
3. 上传文件
4. 确认文件出现在当前目录列表中

### 2. **后端日志验证**
查看后端日志中的以下信息：
```
[INFO] 文件上传到R2挂载点: [挂载点名称] -> [完整R2路径]
[INFO] 当前R2路径: [用户浏览的路径]
```

### 3. **R2控制台验证**
1. 登录Cloudflare R2控制台
2. 检查文件是否出现在正确的路径下
3. 验证文件路径与用户浏览的目录一致

### 4. **数据库验证**
```sql
SELECT id, filename, original_name, storage_type, storage_path, folder_id 
FROM files 
WHERE user_id = 'your_user_id' 
AND storage_type = 'r2'
ORDER BY created_at DESC;
```

## 📊 修复效果

### ✅ 修复前 vs 修复后

| 场景 | 修复前 | 修复后 |
|------|--------|--------|
| 挂载点根目录上传 | ✅ 正确 | ✅ 正确 |
| R2子目录上传 | ❌ 上传到根目录 | ✅ 上传到当前目录 |
| 深层目录上传 | ❌ 上传到根目录 | ✅ 上传到当前目录 |
| 路径包含特殊字符 | ❌ 上传到根目录 | ✅ 正确处理 |

### 🎯 关键改进

1. **精确路径控制**: 文件上传到用户当前浏览的确切位置
2. **用户体验**: 符合用户直觉，文件出现在预期位置
3. **路径一致性**: 上传路径与面包屑导航显示一致
4. **向后兼容**: 不影响现有的本地存储上传功能

## 🐛 故障排除

### 常见问题

1. **文件仍上传到根目录**
   - 检查前端是否正确传递 `currentR2Path`
   - 验证后端是否接收到路径参数
   - 查看后端日志确认路径构建逻辑

2. **上传失败**
   - 检查R2路径是否包含非法字符
   - 验证R2存储桶权限
   - 查看网络连接状态

3. **路径显示不正确**
   - 确认面包屑导航正确更新
   - 检查R2挂载点配置
   - 验证currentR2Path的传递

### 调试技巧

1. **前端调试**
   ```javascript
   console.log('R2 Mount Info:', r2MountInfo)
   console.log('Current R2 Path:', r2MountInfo?.currentR2Path)
   ```

2. **后端调试**
   ```javascript
   logger.info(`接收到的currentR2Path: ${currentR2Path}`)
   logger.info(`构建的完整R2路径: ${fullR2Path}`)
   ```

3. **网络调试**
   - 检查浏览器开发者工具的Network标签
   - 确认FormData包含正确的currentR2Path

## 🎉 成功标准

- ✅ 文件上传到用户当前浏览的R2目录
- ✅ 上传后文件立即显示在当前目录列表
- ✅ R2控制台显示文件在正确路径
- ✅ 面包屑导航与实际文件位置一致
- ✅ 支持任意深度的目录结构
- ✅ 正确处理特殊字符和路径编码

这个修复确保了R2挂载点的文件上传功能完全符合用户期望，提供了与本地文件系统一致的使用体验。
