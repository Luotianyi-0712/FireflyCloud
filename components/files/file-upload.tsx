"use client"

import { useState, useCallback } from "react"
import { useAuth } from "@/components/auth/auth-provider"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent } from "@/components/ui/card"
import { Upload, X, File as FileIcon, CheckCircle } from "lucide-react"
import { useDropzone } from "react-dropzone"

interface FileUploadProps {
  onUploadSuccess: () => void
  currentFolderId?: string | null
}

interface UploadFile {
  file: File
  progress: number
  status: "pending" | "uploading" | "success" | "error"
  error?: string
}

export function FileUpload({ onUploadSuccess, currentFolderId }: FileUploadProps) {
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([])
  const [error, setError] = useState("")
  const { token } = useAuth()

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles = acceptedFiles.map((file) => ({
      file,
      progress: 0,
      status: "pending" as const,
    }))
    setUploadFiles((prev) => [...prev, ...newFiles])
    setError("")
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
  })

  const removeFile = (index: number) => {
    setUploadFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const uploadFile = async (fileItem: UploadFile, index: number) => {
    if (!token) return

    setUploadFiles((prev) =>
      prev.map((item, i) => (i === index ? { ...item, status: "uploading", progress: 0 } : item)),
    )

    try {
      const formData = new FormData()
      formData.append("file", fileItem.file)

      // 添加文件夹ID到表单数据
      if (currentFolderId) {
        formData.append("folderId", currentFolderId)
      }

      const response = await fetch(`${API_URL}/files/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      })

      if (response.ok) {
        setUploadFiles((prev) =>
          prev.map((item, i) => (i === index ? { ...item, status: "success", progress: 100 } : item)),
        )
        onUploadSuccess()
      } else {
        const errorData = await response.json()
        setUploadFiles((prev) =>
          prev.map((item, i) =>
            i === index ? { ...item, status: "error", error: errorData.error || "上传失败" } : item,
          ),
        )
      }
    } catch (err) {
      setUploadFiles((prev) =>
        prev.map((item, i) => (i === index ? { ...item, status: "error", error: "网络错误" } : item)),
      )
    }
  }

  const uploadAllFiles = async () => {
    const pendingFiles = uploadFiles.filter((f) => f.status === "pending")
    for (let i = 0; i < uploadFiles.length; i++) {
      if (uploadFiles[i].status === "pending") {
        await uploadFile(uploadFiles[i], i)
      }
    }
  }

  const clearCompleted = () => {
    setUploadFiles((prev) => prev.filter((f) => f.status !== "success"))
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 字节"
    const k = 1024
    const sizes = ["字节", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card
        {...getRootProps()}
        className={`border-2 border-dashed cursor-pointer transition-colors ${
          isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
        }`}
      >
        <CardContent className="flex flex-col items-center justify-center py-12">
          <input {...getInputProps()} />
          <Upload className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-lg font-medium mb-2">{isDragActive ? "拖放文件到这里" : "拖拽文件到这里"}</p>
          <p className="text-sm text-muted-foreground mb-4">或点击浏览文件</p>
          <Button variant="outline">选择文件</Button>
        </CardContent>
      </Card>

      {uploadFiles.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">待上传文件 ({uploadFiles.length})</h3>
            <div className="flex gap-2">
              <Button onClick={uploadAllFiles} disabled={uploadFiles.every((f) => f.status !== "pending")}>
                全部上传
              </Button>
              <Button variant="outline" onClick={clearCompleted}>
                清除已完成
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {uploadFiles.map((fileItem, index) => (
              <Card key={index}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <FileIcon className="h-8 w-8 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{fileItem.file.name}</p>
                        <p className="text-sm text-muted-foreground">{formatFileSize(fileItem.file.size)}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {fileItem.status === "success" && <CheckCircle className="h-5 w-5 text-green-600" />}
                      {fileItem.status === "error" && <div className="text-sm text-red-600">{fileItem.error}</div>}
                      {fileItem.status === "pending" && (
                        <Button size="sm" onClick={() => uploadFile(fileItem, index)}>
                          上传
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => removeFile(index)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {fileItem.status === "uploading" && (
                    <div className="mt-2">
                      <Progress value={fileItem.progress} className="h-2" />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
