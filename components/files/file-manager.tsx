"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/components/auth/auth-provider"
import { FileUpload } from "./file-upload"
import { FileList } from "./file-list"
import { FolderTree } from "./folder-tree"
import { FolderBreadcrumb } from "./folder-breadcrumb"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Upload, Files, FolderOpen, RefreshCw } from "lucide-react"

interface FileItem {
  id: string
  filename: string
  originalName: string
  size: number
  mimeType: string
  storageType: string
  folderId: string | null
  createdAt: number
}

export function FileManager() {
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const { token } = useAuth()

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"

  useEffect(() => {
    fetchFiles()
  }, [refreshTrigger, selectedFolderId])

  const fetchFiles = async () => {
    if (!token) return

    try {
      const folderId = selectedFolderId === null ? "root" : selectedFolderId
      const response = await fetch(`${API_URL}/files?folderId=${folderId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setFiles(data.files)
      }
    } catch (error) {
      console.error("Failed to fetch files:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleUploadSuccess = () => {
    setRefreshTrigger((prev) => prev + 1)
  }

  const handleDeleteSuccess = () => {
    setRefreshTrigger((prev) => prev + 1)
  }

  const handleFolderSelect = (folderId: string | null) => {
    // 只有当选择的文件夹真的发生变化时才设置loading状态
    if (selectedFolderId !== folderId) {
      setSelectedFolderId(folderId)
      setLoading(true)
    }
  }

  const handleRefresh = () => {
    setRefreshTrigger((prev) => prev + 1)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* 文件夹树 */}
        <div className="lg:col-span-1">
          <FolderTree
            selectedFolderId={selectedFolderId}
            onFolderSelect={handleFolderSelect}
            onRefresh={handleRefresh}
          />
        </div>

        {/* 主内容区域 */}
        <div className="lg:col-span-3">
          <Tabs defaultValue="files" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="files" className="flex items-center gap-2">
                <Files className="h-4 w-4" />
                文件 ({files.length})
              </TabsTrigger>
              <TabsTrigger value="upload" className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                上传文件
              </TabsTrigger>
            </TabsList>

            <TabsContent value="files" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <FolderOpen className="h-5 w-5" />
                        文件管理
                      </CardTitle>
                      <CardDescription>
                        <FolderBreadcrumb
                          currentFolderId={selectedFolderId}
                          onFolderSelect={handleFolderSelect}
                        />
                      </CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRefresh}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      刷新
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <FileList files={files} onDeleteSuccess={handleDeleteSuccess} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="upload" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>上传文件</CardTitle>
                  <CardDescription>
                    上传文件到
                    <FolderBreadcrumb
                      currentFolderId={selectedFolderId}
                      onFolderSelect={handleFolderSelect}
                    />
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FileUpload
                    onUploadSuccess={handleUploadSuccess}
                    currentFolderId={selectedFolderId}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
