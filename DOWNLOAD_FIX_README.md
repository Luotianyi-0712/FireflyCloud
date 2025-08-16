# 下载功能修复说明

## 问题描述

原有的下载逻辑存在两个主要问题：

### 原有问题
1. **用户体验差**: 下载文件时会通过 `window.open()` 打开新标签页，而不是直接下载
2. **认证逻辑错误**: 对已包含令牌的下载URL重复添加认证头，导致 "Invalid download token" 错误
3. **浏览器兼容性**: 某些浏览器可能阻止弹出窗口
4. **不符合标准**: 现代 Web 应用应该直接触发下载，而不是跳转页面

### 根本原因
后端下载流程设计：
1. 前端调用 `/files/{id}/download` 获取包含令牌的下载URL
2. 下载URL格式：`/files/download/{token}` - 令牌已内置，无需额外认证
3. 但前端错误地对这个URL再次添加认证头，导致后端认为令牌无效

## 解决方案

### 1. 创建通用下载函数

在 `lib/utils.ts` 中添加了 `downloadFile` 函数：

```typescript
export async function downloadFile(url: string, filename?: string, token?: string)
```

**功能特性**:
- 智能认证处理：自动识别是否需要添加认证头
- 自动解析文件名（从 Content-Disposition 头）
- 直接触发浏览器下载
- 完整的错误处理
- 支持中文文件名
- 兼容下载令牌URL和R2预签名URL

### 2. 修复的文件和位置

#### 2.1 文件列表组件 (`components/files/file-list.tsx`)
- **修改位置**: `handleDownload` 函数
- **修改内容**: 
  - 导入 `downloadFile` 函数
  - 将 `window.open(data.downloadUrl, '_blank')` 替换为 `await downloadFile(data.downloadUrl, originalName)`
  - 同时修复了 R2 文件和常规文件的下载逻辑

#### 2.2 取件页面 (`app/pickup/page.tsx`)
- **修改位置**: `handleDownload` 函数
- **修改内容**:
  - 导入 `downloadFile` 函数
  - 将 `window.open(data.downloadUrl, '_blank')` 替换为 `await downloadFile(data.downloadUrl, fileInfo.originalName)`

#### 2.3 分享页面 (`app/share/[token]/page.tsx`)
- **修改位置**: `performDownload` 函数
- **修改内容**:
  - 导入 `downloadFile` 函数
  - 将 `window.open(data.downloadUrl, '_blank')` 替换为 `await downloadFile(data.downloadUrl, fileInfo?.originalName)`

## 技术实现细节

### 下载函数工作原理

1. **发起请求**: 使用 `fetch` API 获取文件内容
2. **处理认证**: 如果提供了 token，自动添加 Authorization 头
3. **解析文件名**: 
   - 优先使用传入的 filename 参数
   - 如果没有提供，从 Content-Disposition 头解析
   - 支持 URL 编码的中文文件名
4. **创建下载**: 
   - 将响应转换为 Blob
   - 创建临时 URL
   - 创建隐藏的 `<a>` 元素
   - 设置 download 属性并触发点击
5. **清理资源**: 移除临时元素和 URL

### 错误处理

- **网络错误**: 捕获 fetch 异常
- **HTTP 错误**: 检查响应状态码
- **文件名解析**: 提供默认文件名 fallback
- **用户友好**: 抛出包含详细信息的错误

## 兼容性

### 浏览器支持
- ✅ Chrome 15+
- ✅ Firefox 20+
- ✅ Safari 10+
- ✅ Edge 12+
- ✅ 移动端浏览器

### 文件类型支持
- ✅ 所有文件类型
- ✅ 大文件（通过 Blob 处理）
- ✅ 中文文件名
- ✅ 特殊字符文件名

## 测试

### 测试文件
创建了 `test-download.html` 用于测试下载功能：

1. **基础功能测试**: 测试下载函数是否正常工作
2. **文件名测试**: 测试中文文件名处理
3. **错误处理测试**: 测试异常情况处理
4. **真实下载测试**: 测试与后端 API 的集成

### 测试步骤
1. 在浏览器中打开 `test-download.html`
2. 运行各项测试
3. 验证文件是否正确下载
4. 检查文件名是否正确

## 后端兼容性

当前修改完全兼容现有后端 API：

- **下载令牌机制**: 保持不变
- **R2 存储支持**: 保持不变
- **直链功能**: 保持不变
- **分享下载**: 保持不变

## 用户体验改进

### 修复前
- 点击下载 → 打开新标签页 → 用户需要关闭标签页
- 可能被浏览器拦截弹窗
- 不符合用户对下载的预期

### 修复后
- 点击下载 → 直接开始下载
- 浏览器显示下载进度
- 符合现代 Web 应用标准
- 更好的用户体验

## 注意事项

1. **CORS 设置**: 确保后端正确设置 CORS 头
2. **文件大小**: 大文件下载时可能需要更多内存
3. **浏览器限制**: 某些浏览器对同时下载数量有限制
4. **移动端**: 移动端浏览器的下载行为可能略有不同

## 未来改进

- [ ] 添加下载进度显示
- [ ] 支持断点续传
- [ ] 批量下载功能
- [ ] 下载队列管理
