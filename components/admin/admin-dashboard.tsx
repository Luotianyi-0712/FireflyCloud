"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/components/auth/auth-provider"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Users, Files, Settings, Mail, Cloud, HardDrive } from "lucide-react"
import { AdminStats } from "./admin-stats"
import { UserManagement } from "./user-management"
import { FileManagement } from "./file-management"
import { StorageConfiguration } from "./storage-configuration"
import { SmtpConfiguration } from "./smtp-configuration"
import { R2MountManagement } from "./r2-mount-management"
import { QuotaManagement } from "./quota-management"

export function AdminDashboard() {
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const { token } = useAuth()

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    if (!token) return

    try {
      const response = await fetch(`${API_URL}/admin/stats`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setStats(data)
      }
    } catch (error) {
      console.error("Failed to fetch stats:", error)
    } finally {
      setLoading(false)
    }
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
      {stats && <AdminStats stats={stats} onRefresh={fetchStats} />}

      <Tabs defaultValue="users" className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            用户 ({stats?.totalUsers || 0})
          </TabsTrigger>
          <TabsTrigger value="files" className="flex items-center gap-2">
            <Files className="h-4 w-4" />
            文件 ({stats?.totalFiles || 0})
          </TabsTrigger>
          <TabsTrigger value="quotas" className="flex items-center gap-2">
            <HardDrive className="h-4 w-4" />
            配额管理
          </TabsTrigger>
          <TabsTrigger value="storage" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            存储设置
          </TabsTrigger>
          <TabsTrigger value="r2-mounts" className="flex items-center gap-2">
            <Cloud className="h-4 w-4" />
            R2挂载
          </TabsTrigger>
          <TabsTrigger value="smtp" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            邮件配置
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>用户管理</CardTitle>
              <CardDescription>管理系统用户及其访问权限</CardDescription>
            </CardHeader>
            <CardContent>
              <UserManagement onUserDeleted={fetchStats} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="files" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>文件管理</CardTitle>
              <CardDescription>查看和管理系统中的所有文件</CardDescription>
            </CardHeader>
            <CardContent>
              <FileManagement onFileDeleted={fetchStats} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quotas" className="space-y-4">
          <QuotaManagement />
        </TabsContent>

        <TabsContent value="storage" className="space-y-4">
          <StorageConfiguration />
        </TabsContent>

        <TabsContent value="r2-mounts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>R2 挂载点管理</CardTitle>
              <CardDescription>管理所有用户的 Cloudflare R2 存储桶挂载点</CardDescription>
            </CardHeader>
            <CardContent>
              <R2MountManagement />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="smtp" className="space-y-4">
          <SmtpConfiguration />
        </TabsContent>
      </Tabs>
    </div>
  )
}
