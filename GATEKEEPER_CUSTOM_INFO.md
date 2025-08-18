# 守门模式自定义文件信息功能

## 🎯 功能概述

在分享设置中，当用户启用**守门模式**时，现在可以自定义访问者看到的文件信息，包括：

- **自定义文件名** - 替换原始文件名
- **自定义文件扩展名** - 从常见扩展名中选择或保持原样
- **自定义文件大小** - 以MB为单位自定义显示的文件大小

## 🔧 技术实现

### 数据库变更
在 `file_shares` 表中添加了三个新字段：
- `custom_file_name` (TEXT) - 自定义文件名
- `custom_file_extension` (TEXT) - 自定义文件扩展名  
- `custom_file_size` (INTEGER) - 自定义文件大小（字节，前端以MB输入后转换）

### 自动迁移
数据库初始化时会自动检查并添加缺失的字段，无需手动迁移。

## 🎨 用户界面

### 守门模式设置
1. 在文件分享对话框中勾选"守门模式"
2. 自动展开自定义文件信息设置区域
3. 提供友好的输入界面：
   - 文件名输入框（显示原文件名作为占位符）
   - 扩展名下拉选择（包含常见格式）
   - 文件大小数字输入框（以MB为单位，支持小数）

### 常见扩展名选项
- PDF 文档 (.pdf)
- Word 文档 (.doc, .docx)
- Excel 表格 (.xls, .xlsx)
- PowerPoint (.ppt, .pptx)
- 文本文件 (.txt)
- 图片 (.jpg, .png)
- 视频 (.mp4)
- 音频 (.mp3)
- 压缩包 (.zip, .rar)

## 🔒 安全特性

- 只有在启用守门模式时才能设置自定义信息
- 禁用守门模式时自动清空自定义信息
- 自定义信息仅影响显示，不影响实际文件
- 保持守门模式的下载限制功能

## 📡 API 变更

### 创建分享 API
```json
{
  "gatekeeper": true,
  "customFileName": "重要文档",
  "customFileExtension": "pdf",
  "customFileSize": 1048576
}
```

**注意**: `customFileSize` 在前端以MB为单位输入（如1.5），后端接收时已转换为字节（1572864）。

### 分享信息响应
```json
{
  "file": {
    "originalName": "重要文档",
    "size": 1048576,
    "mimeType": "application/pdf"
  },
  "share": {
    "gatekeeper": true,
    "customInfo": {
      "customFileName": "重要文档",
      "customFileExtension": "pdf",
      "customFileSize": 1048576
    }
  }
}
```

## 🚀 使用场景

1. **隐私保护** - 隐藏真实文件名和大小
2. **信息伪装** - 显示不同的文件类型和大小
3. **访问控制** - 提供文件预览但禁止下载
4. **内容管理** - 统一文件信息展示格式
