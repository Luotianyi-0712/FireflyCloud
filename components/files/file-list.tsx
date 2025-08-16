"use client"

import { useState } from "react"
import { useAuth } from "@/components/auth/auth-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { FilePreview } from "./file-preview"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  File as FileIcon,
  Folder,
  Download,
  Trash2,
  MoreHorizontal,
  Share2,
  Link,
  Copy,
  Calendar,
  HardDrive,
  Cloud,
  CheckCircle,
  Shield,
  Hash,
  Clock,
} from "lucide-react"
import { getFileIcon } from "@/lib/file-icons"
import { DatePicker } from "@/components/ui/date-picker"
import { downloadFile } from "@/lib/utils"

interface FileItem {
  id: string
  filename: string
  originalName: string
  size: number
  mimeType: string
  storageType: string
  createdAt: number
  isR2File?: boolean
  isR2Folder?: boolean
  r2Key?: string
  r2Path?: string
  lastModified?: string
  etag?: string
  mountPointId?: string
  itemCount?: number
}

interface FileListProps {
  files: FileItem[]
  onDeleteSuccess: () => void
}

export function FileList({ files, onDeleteSuccess, onFolderNavigate }: FileListProps & {
  onFolderNavigate?: (folderId: string | null, isR2Folder?: boolean, r2Path?: string, mountPointId?: string) => void
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [directLinkDialog, setDirectLinkDialog] = useState<{
    open: boolean
    fileId: string
    fileName: string
    directUrl: string
    loading: boolean
  }>({
    open: false,
    fileId: "",
    fileName: "",
    directUrl: "",
    loading: false,
  })
  const [copied, setCopied] = useState(false)
  const [shareDialog, setShareDialog] = useState<{
    open: boolean
    fileId: string
    fileName: string
    requireLogin: boolean
    usePickupCode: boolean
    expiresAt: Date | undefined
    loading: boolean
    shareUrl: string
    pickupCode: string | null
  }>({
    open: false,
    fileId: "",
    fileName: "",
    requireLogin: false,
    usePickupCode: false,
    expiresAt: undefined,
    loading: false,
    shareUrl: "",
    pickupCode: null,
  })
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const { token } = useAuth()

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 字节"
    const k = 1024
    const sizes = ["字节", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }



  const handleDownload = async (fileId: string, originalName: string, file?: FileItem) => {
    if (!token) return

    try {
      // 如果是 R2 文件，直接获取公共下载链接
      if (file?.isR2File && file?.r2Key) {
        try {
          const response = await fetch(`${API_URL}/storage/r2/download-url`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ key: file.r2Key }),
          })

          if (response.ok) {
            const data = await response.json()
            // 使用通用下载函数直接下载文件，R2预签名URL不需要额外认证
            await downloadFile(data.downloadUrl, originalName)
            return
          }
        } catch (error) {
          console.error("R2 download failed:", error)
          // 如果 R2 下载失败，回退到常规下载
        }
      }

      // 常规文件下载或 R2 下载失败时的回退
      const response = await fetch(`${API_URL}/files/${fileId}/download`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        // 使用通用下载函数直接下载文件，下载令牌URL不需要额外认证
        await downloadFile(data.downloadUrl, originalName)
      } else {
        const errorData = await response.json().catch(() => ({}))
        console.error("Download failed:", response.status, errorData)
        alert(`下载失败: ${errorData.error || '未知错误'}`)
      }
    } catch (error) {
      console.error("Download failed:", error)
      alert("下载失败: 网络错误")
    }
  }

  const handleGetDirectLink = async (fileId: string, fileName: string) => {
    if (!token) return

    setDirectLinkDialog({
      open: true,
      fileId,
      fileName,
      directUrl: "",
      loading: true,
    })

    try {
      const response = await fetch(`${API_URL}/files/${fileId}/direct-link`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setDirectLinkDialog(prev => ({
          ...prev,
          directUrl: data.directUrl,
          loading: false,
        }))
      } else {
        const errorData = await response.json().catch(() => ({}))
        console.error("Get direct link failed:", response.status, errorData)
        alert(`获取直链失败: ${errorData.error || '未知错误'}`)
        setDirectLinkDialog(prev => ({ ...prev, open: false, loading: false }))
      }
    } catch (error) {
      console.error("Get direct link failed:", error)
      alert("获取直链失败: 网络错误")
      setDirectLinkDialog(prev => ({ ...prev, open: false, loading: false }))
    }
  }

  const handleCopyDirectLink = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(directLinkDialog.directUrl)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } else {
        // 回退方案：使用传统的复制方法
        const textArea = document.createElement('textarea')
        textArea.value = directLinkDialog.directUrl
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch (error) {
      console.error("Copy failed:", error)
      alert("复制失败")
    }
  }

  const handleShare = (fileId: string, fileName: string) => {
    setShareDialog({
      open: true,
      fileId,
      fileName,
      requireLogin: false,
      usePickupCode: false,
      expiresAt: undefined,
      loading: false,
      shareUrl: "",
      pickupCode: null,
    })
  }

  const handleCreateShare = async () => {
    if (!token) return

    setShareDialog(prev => ({ ...prev, loading: true }))

    try {
      const response = await fetch(`${API_URL}/files/${shareDialog.fileId}/share`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          requireLogin: shareDialog.requireLogin,
          usePickupCode: shareDialog.usePickupCode,
          expiresAt: shareDialog.expiresAt ? shareDialog.expiresAt.getTime() : null,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setShareDialog(prev => ({
          ...prev,
          shareUrl: data.shareUrl,
          pickupCode: data.pickupCode,
          loading: false,
        }))
      } else {
        const errorData = await response.json().catch(() => ({}))
        console.error("Create share failed:", response.status, errorData)
        alert(`创建分享失败: ${errorData.error || '未知错误'}`)
        setShareDialog(prev => ({ ...prev, loading: false }))
      }
    } catch (error) {
      console.error("Create share failed:", error)
      alert("创建分享失败: 网络错误")
      setShareDialog(prev => ({ ...prev, loading: false }))
    }
  }

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareDialog.shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error("Copy failed:", error)
      alert("复制失败")
    }
  }

  const handleDelete = async (fileId: string) => {
    if (!token) return

    setDeletingId(fileId)

    try {
      const response = await fetch(`${API_URL}/files/${fileId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        onDeleteSuccess()
      }
    } catch (error) {
      console.error("Delete failed:", error)
    } finally {
      setDeletingId(null)
    }
  }

  // 处理文件夹点击导航
  const handleFolderClick = (file: FileItem) => {
    if (!onFolderNavigate) return;

    if (file.isR2Folder) {
      // 导航到 R2 文件夹
      onFolderNavigate(null, true, file.r2Path, file.mountPointId);
    } else if (file.mimeType === "application/directory") {
      // 导航到本地文件夹
      onFolderNavigate(file.id, false);
    }
  };

  // 处理文件预览
  const handleFilePreview = (file: FileItem) => {
    if (file.isR2Folder || file.mimeType === "application/directory") {
      // 文件夹不支持预览，执行导航
      handleFolderClick(file);
    } else {
      // 打开文件预览
      setPreviewFile(file);
      setPreviewOpen(true);
    }
  };

  // 排序文件，使文件夹显示在前面
  const sortedFiles = [...files].sort((a, b) => {
    const aIsFolder = a.isR2Folder || a.mimeType === "application/directory";
    const bIsFolder = b.isR2Folder || b.mimeType === "application/directory";
    
    // 首先按文件夹/文件类型排序
    if (aIsFolder && !bIsFolder) return -1;
    if (!aIsFolder && bIsFolder) return 1;
    
    // 然后按名称字母顺序排序
    return a.originalName.localeCompare(b.originalName);
  });

  if (files.length === 0) {
    return (
      <div className="text-center py-12">
        <FileIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-medium mb-2">暂无文件</h3>
        <p className="text-muted-foreground">上传您的第一个文件开始使用</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {sortedFiles.map((file) => (
        <Card key={file.id}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div 
                  className={file.isR2Folder || file.mimeType === "application/directory" ? "cursor-pointer" : ""}
                  onClick={() => {
                    if (file.isR2Folder || file.mimeType === "application/directory") {
                      handleFolderClick(file);
                    }
                  }}
                >
                  {file.isR2Folder ? (
                    <Folder className="h-6 w-6 text-blue-500" />
                  ) : file.mimeType === "application/directory" ? (
                    <Folder className="h-6 w-6 text-yellow-500" />
                  ) : (
                    getFileIcon(file.mimeType, file.originalName)
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {file.isR2Folder || file.mimeType === "application/directory" ? (
                      <h4 
                        className="font-medium truncate cursor-pointer hover:text-blue-600 hover:underline" 
                        onClick={() => handleFolderClick(file)}
                      >
                        {file.originalName}
                      </h4>
                    ) : (
                      <h4 
                        className="font-medium truncate cursor-pointer hover:text-blue-600 hover:underline" 
                        onClick={() => handleFilePreview(file)}
                      >
                        {file.originalName}
                      </h4>
                    )}
                    {(file.isR2File || file.isR2Folder) && (
                      <Badge variant="secondary" className="text-xs flex items-center gap-1">
                        <Cloud className="h-3 w-3" />
                        R2 {file.isR2Folder ? "目录" : ""}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                    <span>
                      {file.isR2Folder || file.mimeType === "application/directory" 
                        ? `${file.itemCount || 1}个项目` 
                        : formatFileSize(file.size)
                      }
                    </span>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {file.isR2File && file.lastModified
                        ? formatDate(new Date(file.lastModified).getTime())
                        : formatDate(file.createdAt)
                      }
                    </div>
                    <div className="flex items-center gap-1">
                      {file.isR2File ? (
                        <Cloud className="h-3 w-3" />
                      ) : (
                        <HardDrive className="h-3 w-3" />
                      )}
                      <Badge variant="outline" className="text-xs">
                        {file.storageType.toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleGetDirectLink(file.id, file.originalName)}>
                      <Link className="h-4 w-4 mr-2" />
                      获取直链
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleShare(file.id, file.originalName)}>
                      <Share2 className="h-4 w-4 mr-2" />
                      分享文件
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownload(file.id, file.originalName, file)}
                  className="flex items-center gap-1"
                >
                  <Download className="h-4 w-4" />
                  下载
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 bg-transparent">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>删除文件</AlertDialogTitle>
                      <AlertDialogDescription>
                        您确定要删除 "{file.originalName}" 吗？此操作无法撤销。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDelete(file.id)}
                        disabled={deletingId === file.id}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        {deletingId === file.id ? "删除中..." : "删除"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* 直链对话框 */}
      <Dialog open={directLinkDialog.open} onOpenChange={(open) =>
        setDirectLinkDialog(prev => ({ ...prev, open }))
      }>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>文件直链</DialogTitle>
            <DialogDescription>
              {directLinkDialog.fileName} 的永久下载链接
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {directLinkDialog.loading ? (
              <div className="flex items-center justify-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-sm font-medium">直链地址</label>
                <div className="flex gap-2">
                  <Input
                    value={directLinkDialog.directUrl}
                    readOnly
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyDirectLink}
                    className="flex items-center gap-1"
                  >
                    {copied ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    {copied ? "已复制" : "复制"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  此链接使用原始文件名，可以多次使用，无需登录即可下载文件
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDirectLinkDialog(prev => ({ ...prev, open: false }))}
            >
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 分享对话框 */}
      <Dialog open={shareDialog.open} onOpenChange={(open) =>
        setShareDialog(prev => ({ ...prev, open }))
      }>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>分享文件</DialogTitle>
            <DialogDescription>
              {shareDialog.fileName} 的分享设置
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {!shareDialog.shareUrl ? (
              // 分享设置阶段
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="requireLogin"
                    checked={shareDialog.requireLogin}
                    onChange={(e) => setShareDialog(prev => ({
                      ...prev,
                      requireLogin: e.target.checked
                    }))}
                    className="rounded"
                  />
                  <label htmlFor="requireLogin" className="text-sm font-medium flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    需要登录后才能下载
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="usePickupCode"
                    checked={shareDialog.usePickupCode}
                    onChange={(e) => setShareDialog(prev => ({
                      ...prev,
                      usePickupCode: e.target.checked
                    }))}
                    className="rounded"
                  />
                  <label htmlFor="usePickupCode" className="text-sm font-medium flex items-center gap-2">
                    <Hash className="h-4 w-4" />
                    使用取件码
                    <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">BETA</span>
                  </label>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    有效期
                  </label>
                  <DatePicker
                    date={shareDialog.expiresAt}
                    onDateChange={(date) => setShareDialog(prev => ({
                      ...prev,
                      expiresAt: date
                    }))}
                    placeholder="留空表示永久有效"
                  />
                  <p className="text-xs text-muted-foreground">
                    设置分享的过期时间，留空则永久有效
                  </p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-xs text-blue-800">
                    <strong>分享方式说明：</strong><br/>
                    • <strong>分享链接</strong>：生成链接，任何人都可通过链接访问<br/>
                    • <strong>取件码</strong>：生成6位数字取件码，需要在取件页面输入取件码
                  </p>
                </div>
              </div>
            ) : (
              // 分享结果阶段
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">分享链接</label>
                  <div className="flex gap-2">
                    <Input
                      value={shareDialog.shareUrl}
                      readOnly
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyShareLink}
                      className="flex items-center gap-1"
                    >
                      {copied ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                      {copied ? "已复制" : "复制"}
                    </Button>
                  </div>
                </div>
                {shareDialog.pickupCode && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">取件码</label>
                    <div className="p-3 bg-muted rounded-lg text-center">
                      <span className="text-2xl font-mono font-bold">{shareDialog.pickupCode}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      请将此取件码告知下载者
                    </p>
                  </div>
                )}
                {shareDialog.expiresAt && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      有效期
                    </label>
                    <div className="p-3 bg-muted rounded-lg">
                      <span className="text-sm">
                        {shareDialog.expiresAt.toLocaleDateString("zh-CN", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })} 过期
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            {!shareDialog.shareUrl ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setShareDialog(prev => ({ ...prev, open: false }))}
                >
                  取消
                </Button>
                <Button
                  onClick={handleCreateShare}
                  disabled={shareDialog.loading}
                >
                  {shareDialog.loading ? "创建中..." : "创建分享"}
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                onClick={() => setShareDialog(prev => ({ ...prev, open: false }))}
              >
                关闭
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 文件预览对话框 */}
      <FilePreview
        file={previewFile}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />
    </div>
  )
}
