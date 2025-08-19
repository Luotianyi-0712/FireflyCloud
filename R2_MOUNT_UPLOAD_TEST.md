# R2挂载点文件上传功能测试

## 📋 功能概述

实现了在已挂载Cloudflare R2的文件夹内默认上传到R2存储桶的功能，支持文件夹层级结构。

## 🔧 实现的功能

### 1. **智能存储选择**
- 检查目标文件夹是否有R2挂载点
- 如果有R2挂载点，自动使用R2存储
- 如果没有，使用系统默认存储

### 2. **文件夹层级支持**
- 支持在R2挂载点的子文件夹中上传文件
- 自动计算从挂载点到目标文件夹的相对路径
- 正确构建R2存储桶中的文件路径

### 3. **路径处理**
- 挂载点路径 + 相对路径 + 文件名 = 完整R2路径
- 例如：`documents/projects/file.txt`

## 🧪 测试步骤

### 前置条件
1. 配置好Cloudflare R2存储
2. 创建测试文件夹结构
3. 设置R2挂载点

### 测试场景

#### 场景1：直接在挂载点文件夹上传
```
文件夹结构：
/documents (已挂载到R2: "docs/")

操作：在 /documents 文件夹中上传 test.txt
预期结果：文件存储到 R2 的 "docs/test.txt"
```

#### 场景2：在挂载点子文件夹上传
```
文件夹结构：
/documents (已挂载到R2: "docs/")
  └── /projects

操作：在 /documents/projects 文件夹中上传 project.txt
预期结果：文件存储到 R2 的 "docs/projects/project.txt"
```

#### 场景3：在非挂载点文件夹上传
```
文件夹结构：
/uploads (未挂载)

操作：在 /uploads 文件夹中上传 file.txt
预期结果：文件存储到默认存储（本地或系统配置的R2）
```

## 🔍 验证方法

### 1. **数据库检查**
```sql
SELECT id, filename, original_name, storage_type, storage_path, folder_id 
FROM files 
WHERE user_id = 'your_user_id' 
ORDER BY created_at DESC;
```

### 2. **R2存储桶检查**
- 登录Cloudflare R2控制台
- 检查文件是否出现在正确的路径下
- 验证文件内容是否正确

### 3. **日志检查**
查看后端日志中的以下信息：
- `发现R2挂载点: [挂载点名称] -> [R2路径]`
- `文件上传到R2挂载点: [挂载点名称] -> [完整R2路径]`

## 📊 预期行为

### 存储类型记录
- 上传到R2挂载点的文件：`storage_type = "r2"`
- 上传到默认存储的文件：`storage_type = [系统配置]`

### 路径构建规则
1. **挂载点根目录**：`[r2Path]/[filename]`
2. **挂载点子目录**：`[r2Path]/[relativePath]/[filename]`
3. **空挂载路径**：`[relativePath]/[filename]` 或 `[filename]`

## ⚠️ 注意事项

1. **权限检查**：确保用户对目标文件夹有写入权限
2. **配额限制**：R2上传仍然受用户存储配额限制
3. **路径安全**：相对路径计算确保不会越界访问
4. **错误处理**：R2上传失败时的回退机制

## 🐛 故障排除

### 常见问题
1. **文件未上传到R2**
   - 检查R2挂载点是否启用
   - 验证R2配置是否正确
   - 查看错误日志

2. **路径不正确**
   - 检查文件夹层级关系
   - 验证挂载点配置
   - 确认相对路径计算

3. **权限错误**
   - 验证用户对文件夹的访问权限
   - 检查R2存储桶权限配置

## 📝 开发说明

### 关键文件
- `backend/src/routes/files.ts` - 文件上传逻辑
- `backend/src/services/storage.ts` - 存储服务
- `backend/src/db/schema.ts` - R2挂载点数据结构

### 核心函数
- `calculateFolderRelativePath()` - 计算相对路径
- `uploadToR2Direct()` - 直接上传到R2指定路径
- R2挂载点检查逻辑

这个功能使得用户可以无缝地在已挂载的R2文件夹中上传文件，系统会自动选择正确的存储位置。
