"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/components/auth/auth-provider"
import { FileUpload } from "./file-upload"
import { FileList } from "./file-list"
import { FolderTree } from "./folder-tree"
import { FolderBreadcrumb } from "./folder-breadcrumb"
import { QuotaDisplay } from "./quota-display"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Upload, Files, FolderOpen, RefreshCw, Cloud } from "lucide-react"

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
  const [folders, setFolders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [r2MountInfo, setR2MountInfo] = useState<any>(null)
  const { token } = useAuth()

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"

  useEffect(() => {
    fetchFiles()
    fetchFolders()
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

      let allFiles: FileItem[] = []

      if (response.ok) {
        const data = await response.json()
        allFiles = data.files || []
      }

      // 如果选择了文件夹，尝试获取 R2 挂载内容
      if (selectedFolderId) {
        try {
          const r2Response = await fetch(`${API_URL}/folders/${selectedFolderId}/r2-contents`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          })

          if (r2Response.ok) {
            const r2Data = await r2Response.json()
            // 合并 R2 文件到文件列表
            allFiles = [...allFiles, ...(r2Data.files || [])]
            
            // 将 R2 子目录转换为虚拟文件夹条目
            const r2FolderItems = (r2Data.folders || []).map((folder: {
              id: string,
              name: string,
              path: string,
              mountPointId: string,
              itemCount?: number
            }) => ({
              id: folder.id,
              filename: folder.name,
              originalName: folder.name,
              size: 0,
              mimeType: "application/directory",
              storageType: "r2",
              createdAt: Date.now(),
              isR2Folder: true, // 标记为 R2 文件夹
              r2Path: folder.path,
              mountPointId: folder.mountPointId,
              itemCount: folder.itemCount || 0 // 添加项目计数
            }));
            
            // 合并 R2 文件夹到文件列表
            allFiles = [...allFiles, ...r2FolderItems];
            
            // 保存 R2 挂载信息
            setR2MountInfo(r2Data.mountPoint)
          } else {
            setR2MountInfo(null)
          }
        } catch (r2Error) {
          // R2 挂载内容获取失败不影响常规文件显示
          console.log("No R2 mount or failed to fetch R2 contents:", r2Error)
          setR2MountInfo(null)
        }

        // OneDrive 功能暂时禁用
        // 尝试获取 OneDrive 挂载内容 - 功能开发中，敬请期待
      } else {
        setR2MountInfo(null)
      }

      setFiles(allFiles)
    } catch (error) {
      console.error("Failed to fetch files:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchFolders = async () => {
    if (!token) return

    try {
      const response = await fetch(`${API_URL}/folders`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setFolders(data.folders || [])
      }
    } catch (error) {
      console.error("Failed to fetch folders:", error)
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
  
  // 处理文件列表中的文件夹导航
  const handleFolderNavigate = (folderId: string | null, isR2Folder?: boolean, r2Path?: string, mountPointId?: string, isOneDriveFolder?: boolean, oneDrivePath?: string) => {
    if (isR2Folder && r2Path && mountPointId) {
      // 这是一个R2文件夹，需要特殊处理
      // 我们需要获取当前挂载点信息，更新当前R2挂载路径并保持在同一文件夹中
      console.log(`导航到R2文件夹: ${r2Path}`)
      
      // 保持在当前选中的文件夹中，但更新 R2 路径
      // 这里需要调用API获取R2子目录内容
      // 为简单起见，我们可以直接刷新当前页面，后端会根据新的r2Path获取内容
      setLoading(true);
      
      // 以AJAX方式获取指定R2路径的内容
      if (token && selectedFolderId) {
        // 使用查询参数来传递R2路径
        const queryParams = new URLSearchParams({ r2Path });
        
        fetch(`${API_URL}/folders/${selectedFolderId}/r2-contents?${queryParams}`, {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        })
          .then(response => response.json())
          .then(data => {
            // 更新文件列表，包括文件和文件夹
            let allFiles: FileItem[] = [];
            
            // 添加R2文件
            allFiles = [...allFiles, ...(data.files || [])];
            
            // 将R2文件夹转换为条目
            const r2FolderItems = (data.folders || []).map((folder: any) => ({
              id: folder.id,
              filename: folder.name,
              originalName: folder.name,
              size: 0,
              mimeType: "application/directory",
              storageType: "r2",
              createdAt: Date.now(),
              isR2Folder: true,
              r2Path: folder.path,
              mountPointId: folder.mountPointId,
              itemCount: folder.itemCount || 0 // 添加项目计数
            }));
            
            allFiles = [...allFiles, ...r2FolderItems];
            
            // 更新文件列表
            setFiles(allFiles);
            setR2MountInfo({
              ...data.mountPoint,
              currentR2Path: r2Path
            });
            setLoading(false);
          })
          .catch(error => {
            console.error("Failed to navigate to R2 folder:", error);
            setLoading(false);
            // 刷新整个列表作为回退方案
            setRefreshTrigger(prev => prev + 1);
          });
      }
    } else if (isOneDriveFolder && oneDrivePath && mountPointId) {
      // OneDrive 功能暂时禁用 - 敬请期待
      console.log("OneDrive 功能暂时禁用，敬请期待后续版本更新")
      // 回退到普通文件夹导航
      handleFolderSelect(folderId);
    } else {
      // 普通文件夹导航
      handleFolderSelect(folderId);
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
        {/* 文件夹树和配额显示 */}
        <div className="lg:col-span-1 space-y-4">
          <FolderTree
            selectedFolderId={selectedFolderId}
            onFolderSelect={handleFolderSelect}
            onRefresh={handleRefresh}
          />
          <QuotaDisplay />
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
                        <div className="space-y-2">
                          <FolderBreadcrumb
                            currentFolderId={selectedFolderId}
                            onFolderSelect={handleFolderSelect}
                          />
                          {r2MountInfo && (
                            <div className="flex items-center gap-2 text-sm">
                              <Cloud className="h-4 w-4 text-purple-500" />
                              <span className="text-purple-600">
                                R2 挂载: {r2MountInfo.mountName} → {r2MountInfo.r2Path || "/"}
                              </span>
                            </div>
                          )}
                        </div>
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
                  <FileList 
                    files={files} 
                    onDeleteSuccess={handleDeleteSuccess}
                    onFolderNavigate={handleFolderNavigate}
                  />
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
