import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 下载文件的通用函数
 * @param url 下载链接（可能是带令牌的URL或需要认证的URL）
 * @param filename 文件名（可选）
 * @param token 认证令牌（可选，仅当URL需要认证时使用）
 */
export async function downloadFile(url: string, filename?: string, token?: string) {
  try {
    const headers: Record<string, string> = {}

    // 如果是跨域 URL（如 OneDrive/Graph），直接创建 a 标签跳转，避免因 CORS 导致的 0KB blob
    try {
      const parsed = new URL(url, window.location.href)
      const isCrossOrigin = parsed.origin !== window.location.origin
      if (isCrossOrigin) {
        const link = document.createElement('a')
        link.href = url
        // 一些浏览器对跨域下载忽略 download 属性，但设置也无妨
        if (filename) link.download = filename
        link.rel = 'noopener'
        link.target = '_blank'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        return true
      }
    } catch {
      // URL 解析失败则走原有逻辑
    }

    // 只有当URL不包含令牌且提供了token时才添加认证头
    if (token && !url.includes('/files/download/')) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const response = await fetch(url, {
      method: 'GET',
      headers,
    })

    if (!response.ok) {
      throw new Error(`下载失败: ${response.status} ${response.statusText}`)
    }

    // 获取文件名
    let downloadFilename = filename
    if (!downloadFilename) {
      const contentDisposition = response.headers.get('Content-Disposition')
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
        if (filenameMatch && filenameMatch[1]) {
          downloadFilename = decodeURIComponent(filenameMatch[1].replace(/["']/g, ''))
        }
      }
    }

    // 获取文件内容
    const blob = await response.blob()

    // 创建下载链接
    const downloadUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = downloadFilename || 'download'

    // 触发下载
    document.body.appendChild(link)
    link.click()

    // 清理
    document.body.removeChild(link)
    URL.revokeObjectURL(downloadUrl)

    return true
  } catch (error) {
    console.error('下载失败:', error)
    throw error
  }
}
