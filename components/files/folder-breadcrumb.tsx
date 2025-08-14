"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/components/auth/auth-provider"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Home, Folder } from "lucide-react"

interface FolderItem {
  id: string
  name: string
  parentId: string | null
  path: string
}

interface FolderBreadcrumbProps {
  currentFolderId: string | null
  onFolderSelect: (folderId: string | null) => void
}

export function FolderBreadcrumb({ currentFolderId, onFolderSelect }: FolderBreadcrumbProps) {
  const [breadcrumbPath, setBreadcrumbPath] = useState<FolderItem[]>([])
  const [loading, setLoading] = useState(false)
  const { token } = useAuth()

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"

  useEffect(() => {
    if (currentFolderId) {
      fetchBreadcrumbPath()
    } else {
      setBreadcrumbPath([])
    }
  }, [currentFolderId])

  const fetchBreadcrumbPath = async () => {
    if (!token || !currentFolderId) return

    setLoading(true)
    try {
      const response = await fetch(`${API_URL}/folders`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        const folders = data.folders as FolderItem[]
        
        // 构建从根目录到当前文件夹的路径
        const path = buildPathToFolder(folders, currentFolderId)
        setBreadcrumbPath(path)
      }
    } catch (error) {
      console.error("Failed to fetch breadcrumb path:", error)
    } finally {
      setLoading(false)
    }
  }

  const buildPathToFolder = (folders: FolderItem[], targetId: string): FolderItem[] => {
    const folderMap = new Map<string, FolderItem>()
    folders.forEach(folder => folderMap.set(folder.id, folder))

    const path: FolderItem[] = []
    let currentFolder = folderMap.get(targetId)

    while (currentFolder) {
      path.unshift(currentFolder)
      currentFolder = currentFolder.parentId ? folderMap.get(currentFolder.parentId) : null
    }

    return path
  }

  if (loading) {
    return (
      <div className="flex items-center space-x-2">
        <div className="animate-pulse h-4 bg-muted rounded w-32"></div>
      </div>
    )
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {/* 根目录 */}
        <BreadcrumbItem>
          <BreadcrumbLink
            href="#"
            onClick={(e) => {
              e.preventDefault()
              onFolderSelect(null)
            }}
            className="flex items-center gap-1"
          >
            <Home className="h-4 w-4" />
            根目录
          </BreadcrumbLink>
        </BreadcrumbItem>

        {/* 文件夹路径 */}
        {breadcrumbPath.map((folder, index) => (
          <div key={folder.id} className="flex items-center">
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              {index === breadcrumbPath.length - 1 ? (
                <BreadcrumbPage className="flex items-center gap-1">
                  <Folder className="h-4 w-4" />
                  {folder.name}
                </BreadcrumbPage>
              ) : (
                <BreadcrumbLink
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    onFolderSelect(folder.id)
                  }}
                  className="flex items-center gap-1"
                >
                  <Folder className="h-4 w-4" />
                  {folder.name}
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </div>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
