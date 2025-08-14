"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Download,
  File,
  Calendar,
  HardDrive,
  Shield,
  Hash,
  AlertCircle,
  Cloud
} from "lucide-react"
import { getFileIcon } from "@/lib/file-icons"

interface FileInfo {
  id: string
  originalName: string
  size: number
  mimeType: string
  createdAt: number
}

interface ShareInfo {
  requireLogin: boolean
  hasPickupCode: boolean
  accessCount: number
  createdAt: number
}

export default function SharePage() {
  const params = useParams()
  const token = params.token as string
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null)
  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null)
  const [pickupCode, setPickupCode] = useState("")
  const [downloading, setDownloading] = useState(false)
  const [pickupCodeDialog, setPickupCodeDialog] = useState(false)

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"

  useEffect(() => {
    fetchShareInfo()
  }, [token])

  const fetchShareInfo = async () => {
    try {
      const response = await fetch(`${API_URL}/share/${token}`)
      
      if (response.ok) {
        const data = await response.json()
        setFileInfo(data.file)
        setShareInfo(data.share)
      } else {
        const errorData = await response.json().catch(() => ({}))
        setError(errorData.error || "分享不存在或已失效")
      }
    } catch (error) {
      console.error("Failed to fetch share info:", error)
      setError("网络错误，请稍后重试")
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = async () => {
    if (!fileInfo || !shareInfo) return

    // 如果需要取件码，先显示取件码输入对话框
    if (shareInfo.hasPickupCode) {
      setPickupCodeDialog(true)
      return
    }

    // 直接下载
    await performDownload()
  }

  const performDownload = async () => {
    setDownloading(true)

    try {
      const requestBody: any = {}
      if (shareInfo?.hasPickupCode) {
        requestBody.pickupCode = pickupCode
      }

      const response = await fetch(`${API_URL}/share/${token}/download`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      })

      if (response.ok) {
        const data = await response.json()
        // 在新窗口中打开下载链接
        window.open(data.downloadUrl, '_blank')
        setPickupCodeDialog(false)
        setPickupCode("")
      } else {
        const errorData = await response.json().catch(() => ({}))
        alert(`下载失败: ${errorData.error || '未知错误'}`)
      }
    } catch (error) {
      console.error("Download failed:", error)
      alert("下载失败: 网络错误")
    } finally {
      setDownloading(false)
    }
  }

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



  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">分享不可用</h3>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-14 items-center px-4">
          <div className="flex items-center space-x-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Cloud className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-bold">FireflyCloud</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <File className="h-5 w-5" />
                文件分享
              </CardTitle>
              <CardDescription>
                有人向你分享了一个文件
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 文件信息 */}
              <div className="flex items-center gap-4 p-4 border rounded-lg">
                <div>{getFileIcon(fileInfo!.mimeType, fileInfo!.originalName, { size: "lg" })}</div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium truncate">{fileInfo!.originalName}</h3>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                    <span>{formatFileSize(fileInfo!.size)}</span>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(fileInfo!.createdAt)}
                    </div>
                  </div>
                </div>
              </div>

              {/* 分享信息 */}
              <div className="space-y-3">
                <h4 className="font-medium">分享信息</h4>
                <div className="flex flex-wrap gap-2">
                  {shareInfo!.requireLogin && (
                    <Badge variant="outline" className="flex items-center gap-1">
                      <Shield className="h-3 w-3" />
                      需要登录
                    </Badge>
                  )}
                  {shareInfo!.hasPickupCode && (
                    <Badge variant="outline" className="flex items-center gap-1">
                      <Hash className="h-3 w-3" />
                      需要取件码
                    </Badge>
                  )}
                  <Badge variant="outline">
                    已下载 {shareInfo!.accessCount} 次
                  </Badge>
                </div>
              </div>

              <Separator />

              {/* 下载按钮 */}
              <div className="flex justify-center">
                <Button
                  size="lg"
                  onClick={handleDownload}
                  disabled={downloading}
                  className="flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  {downloading ? "下载中..." : "下载文件"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 取件码对话框 */}
      <Dialog open={pickupCodeDialog} onOpenChange={setPickupCodeDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>输入取件码</DialogTitle>
            <DialogDescription>
              此文件需要取件码才能下载，请输入6位数字取件码
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="请输入6位数字取件码"
              value={pickupCode}
              onChange={(e) => setPickupCode(e.target.value)}
              maxLength={6}
              className="text-center text-lg tracking-widest"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPickupCodeDialog(false)}
            >
              取消
            </Button>
            <Button
              onClick={performDownload}
              disabled={downloading || pickupCode.length !== 6}
            >
              {downloading ? "下载中..." : "确认下载"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
