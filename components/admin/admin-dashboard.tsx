"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/components/auth/auth-provider"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Users, Files, Settings, Mail, Cloud, HardDrive, Key, ChevronDown } from "lucide-react"
import { useIsMobile } from "@/components/ui/use-mobile"
import { AdminStats } from "./admin-stats"
import { UserManagement } from "./user-management"
import { FileManagement } from "./file-management"
import { StorageConfiguration } from "./storage-configuration"
import { SmtpConfiguration } from "./smtp-configuration"
import { R2MountManagement } from "./r2-mount-management"
import { QuotaManagement } from "./quota-management"
import { AdminSettings } from "./admin-settings"

export function AdminDashboard() {
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("users")
  const [loadedTabs, setLoadedTabs] = useState<Set<string>>(new Set(["users"]))
  const { token } = useAuth()
  const isMobile = useIsMobile()

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"

  // Tab配置数据
  const tabsConfig = [
    {
      value: "users",
      label: "用户",
      icon: Users,
      count: stats?.totalUsers || 0,
      description: "管理系统用户及其访问权限"
    },
    {
      value: "files",
      label: "文件",
      icon: Files,
      count: stats?.totalFiles || 0,
      description: "查看和管理系统中的所有文件"
    },
    {
      value: "quotas",
      label: "配额管理",
      icon: HardDrive,
      description: "管理用户存储配额"
    },
    {
      value: "storage",
      label: "存储设置",
      icon: Settings,
      description: "配置存储相关设置"
    },
    {
      value: "r2-mounts",
      label: "R2挂载",
      icon: Cloud,
      description: "管理所有用户的 Cloudflare R2 存储桶挂载点"
    },
    {
      value: "smtp",
      label: "邮件配置",
      icon: Mail,
      description: "配置SMTP邮件服务"
    },
    {
      value: "admin-settings",
      label: "管理员设置",
      icon: Key,
      description: "管理员相关设置"
    }
  ]

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

  const handleTabChange = (value: string) => {
    setActiveTab(value)
    setLoadedTabs(prev => new Set([...prev, value]))
  }

  const isTabLoaded = (tabValue: string) => {
    return loadedTabs.has(tabValue)
  }

  useEffect(() => {
    fetchStats()
  }, [token])

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

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        {/* 移动端使用下拉选择 */}
        {isMobile ? (
          <div className="mb-6">
            <Select value={activeTab} onValueChange={handleTabChange}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(() => {
                    const currentTab = tabsConfig.find(tab => tab.value === activeTab)
                    if (!currentTab) return "选择功能"
                    const Icon = currentTab.icon
                    return (
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        <span>{currentTab.label}</span>
                        {currentTab.count !== undefined && (
                          <span className="text-muted-foreground">({currentTab.count})</span>
                        )}
                      </div>
                    )
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {tabsConfig.map((tab) => {
                  const Icon = tab.icon
                  return (
                    <SelectItem key={tab.value} value={tab.value}>
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        <span>{tab.label}</span>
                        {tab.count !== undefined && (
                          <span className="text-muted-foreground">({tab.count})</span>
                        )}
                      </div>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>
        ) : (
          /* 桌面端使用响应式网格 */
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-1 h-auto p-1 transition-all duration-200">
            {tabsConfig.map((tab) => {
              const Icon = tab.icon
              return (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="flex items-center gap-1 lg:gap-2 transition-all duration-200 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground hover:bg-muted text-xs lg:text-sm p-2 lg:p-3 h-auto min-h-[2.5rem] lg:min-h-[3rem]"
                >
                  <Icon className="h-3 w-3 lg:h-4 lg:w-4 flex-shrink-0" />
                  <div className="flex flex-col items-center lg:flex-row lg:gap-1">
                    <span className="truncate">{tab.label}</span>
                    {tab.count !== undefined && (
                      <span className="text-xs opacity-70 hidden lg:inline">({tab.count})</span>
                    )}
                  </div>
                </TabsTrigger>
              )
            })}
          </TabsList>
        )}

        <TabsContent value="users" className="space-y-4 animate-in fade-in-50 duration-300">
          <Card>
            <CardHeader>
              <CardTitle>用户管理</CardTitle>
              <CardDescription>管理系统用户及其访问权限</CardDescription>
            </CardHeader>
            <CardContent>
              {isTabLoaded("users") && <UserManagement onUserDeleted={fetchStats} />}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="files" className="space-y-4 animate-in fade-in-50 duration-300">
          <Card>
            <CardHeader>
              <CardTitle>文件管理</CardTitle>
              <CardDescription>查看和管理系统中的所有文件</CardDescription>
            </CardHeader>
            <CardContent>
              {isTabLoaded("files") && <FileManagement onFileDeleted={fetchStats} />}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quotas" className="space-y-4 animate-in fade-in-50 duration-300">
          {isTabLoaded("quotas") && <QuotaManagement />}
        </TabsContent>

        <TabsContent value="storage" className="space-y-4 animate-in fade-in-50 duration-300">
          {isTabLoaded("storage") && <StorageConfiguration />}
        </TabsContent>

        <TabsContent value="r2-mounts" className="space-y-4 animate-in fade-in-50 duration-300">
          <Card>
            <CardHeader>
              <CardTitle>R2 挂载点管理</CardTitle>
              <CardDescription>管理所有用户的 Cloudflare R2 存储桶挂载点</CardDescription>
            </CardHeader>
            <CardContent>
              {isTabLoaded("r2-mounts") && <R2MountManagement />}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="smtp" className="space-y-4 animate-in fade-in-50 duration-300">
          {isTabLoaded("smtp") && <SmtpConfiguration />}
        </TabsContent>

        <TabsContent value="admin-settings" className="space-y-4 animate-in fade-in-50 duration-300">
          {isTabLoaded("admin-settings") && <AdminSettings />}
        </TabsContent>
      </Tabs>
    </div>
  )
}
