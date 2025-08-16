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

    // 只有当URL不包含令牌且提供了token时才添加认证头
    // 下载令牌URL格式：/files/download/{token} 不需要额外认证
    // R2直链或其他需要认证的URL才需要token
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
          downloadFilename = decodeURIComponent(filenameMatch[1].replace(/['"]/g, ''))
        }
      }
    }

    // 获取文件内容
    const blob = await response.blob()

    // 创建下载链接 - 修复URL构造函数使用
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
