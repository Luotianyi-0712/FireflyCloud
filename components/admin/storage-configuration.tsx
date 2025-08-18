"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/components/auth/auth-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"

import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"
import { HardDrive, Cloud, Save, CheckCircle, AlertCircle, Clock } from "lucide-react"
import { toast } from "sonner"

interface StorageConfig {
  enableLocal: boolean
  enableR2: boolean
  enableOneDrive: boolean
  r2Endpoint: string
  r2Bucket: string
  oneDriveClientId: string
  oneDriveTenantId: string
}

export function StorageConfiguration() {
  const [config, setConfig] = useState<StorageConfig>({
    enableLocal: true,
    enableR2: false,
    enableOneDrive: false,
    r2Endpoint: "",
    r2Bucket: "",
    oneDriveClientId: "",
    oneDriveTenantId: "",
  })
  const [formData, setFormData] = useState({
    enableLocal: true,
    enableR2: false,
    enableOneDrive: false,
    r2Endpoint: "",
    r2AccessKey: "",
    r2SecretKey: "",
    r2Bucket: "",
    oneDriveClientId: "",
    oneDriveClientSecret: "",
    oneDriveTenantId: "",
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { token } = useAuth()

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"

  useEffect(() => {
    fetchConfig()
  }, [])

  const fetchConfig = async () => {
    if (!token) return

    try {
      const response = await fetch(`${API_URL}/storage/config`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()

        // 将后端的旧格式转换为前端的新格式
        const convertedConfig = {
          enableLocal: data.config.enableMixedMode || data.config.storageType === "local",
          enableR2: data.config.enableMixedMode || data.config.storageType === "r2",
          // OneDrive 暂时禁用
          enableOneDrive: false,
          r2Endpoint: data.config.r2Endpoint || "",
          r2Bucket: data.config.r2Bucket || "",
          oneDriveClientId: data.config.oneDriveClientId || "",
          oneDriveTenantId: data.config.oneDriveTenantId || "",
        }

        setConfig(convertedConfig)
        setFormData({
          enableLocal: convertedConfig.enableLocal,
          enableR2: convertedConfig.enableR2,
          enableOneDrive: false, // 强制禁用 OneDrive
          r2Endpoint: convertedConfig.r2Endpoint,
          r2AccessKey: "",
          r2SecretKey: "",
          r2Bucket: convertedConfig.r2Bucket,
          oneDriveClientId: convertedConfig.oneDriveClientId,
          oneDriveClientSecret: "",
          oneDriveTenantId: convertedConfig.oneDriveTenantId,
        })
      }
    } catch (error) {
      console.error("Failed to fetch storage config:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!token) return

    // 验证至少选择一个存储后端（OneDrive 暂时禁用）
    const enabledCount = (formData.enableLocal ? 1 : 0) +
                        (formData.enableR2 ? 1 : 0)

    if (enabledCount === 0) {
      toast.error("配置错误", {
        description: "请至少选择一个存储后端"
      })
      return
    }

    setSaving(true)

    try {
      // 转换新的复选框格式为后端期望的格式

      const backendData = {
        // 确定主要存储类型（后端只支持 local 和 r2）
        storageType: formData.enableLocal ? "local" :
                    formData.enableR2 ? "r2" : "local",
        // 如果启用了多个存储则启用混合模式（OneDrive 暂时禁用）
        enableMixedMode: enabledCount > 1,
        r2Endpoint: formData.r2Endpoint,
        r2AccessKey: formData.r2AccessKey,
        r2SecretKey: formData.r2SecretKey,
        r2Bucket: formData.r2Bucket,
        // OneDrive 配置暂时清空
        oneDriveClientId: "",
        oneDriveClientSecret: "",
        oneDriveTenantId: "",
      }

      const response = await fetch(`${API_URL}/storage/config`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(backendData),
      })

      if (response.ok) {
        toast.success("存储配置已保存", {
          description: "存储配置已成功更新并生效"
        })
        fetchConfig()
      } else {
        const errorData = await response.json()
        toast.error("配置保存失败", {
          description: errorData.error || "无法保存存储配置"
        })
      }
    } catch (error) {
      toast.error("保存失败", {
        description: "网络连接错误，请稍后重试"
      })
    } finally {
      setSaving(false)
    }
  }

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            当前存储后端
            <div className="flex gap-2">
              {config.enableLocal && <Badge variant="secondary">本地存储</Badge>}
              {config.enableR2 && <Badge variant="default">Cloudflare R2</Badge>}
              {config.enableOneDrive && <Badge variant="default">OneDrive</Badge>}
              {!config.enableLocal && !config.enableR2 && !config.enableOneDrive && (
                <Badge variant="destructive">未配置</Badge>
              )}
            </div>
          </CardTitle>
          <CardDescription>
            {(() => {
              const enabledStorages = []
              if (config.enableLocal) enabledStorages.push("本地存储")
              if (config.enableR2) enabledStorages.push(`Cloudflare R2${config.r2Bucket ? ` (${config.r2Bucket})` : ""}`)
              if (config.enableOneDrive) enabledStorages.push("OneDrive")

              if (enabledStorages.length === 0) {
                return "未配置任何存储后端"
              } else if (enabledStorages.length === 1) {
                return `文件存储在：${enabledStorages[0]}`
              } else {
                return `多存储模式：${enabledStorages.join("、")}`
              }
            })()}
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>存储配置</CardTitle>
          <CardDescription>配置文件存储位置</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <Label className="text-base font-medium">存储策略</Label>
            <p className="text-sm text-muted-foreground">选择一个或多个存储后端，支持同时使用多种存储方式。OneDrive 功能正在开发中，敬请期待。</p>

            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="enableLocal"
                  checked={formData.enableLocal}
                  onCheckedChange={(checked) => handleInputChange("enableLocal", checked)}
                />
                <Label htmlFor="enableLocal" className="flex items-center gap-2 cursor-pointer">
                  <HardDrive className="h-4 w-4" />
                  本地存储
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="enableR2"
                  checked={formData.enableR2}
                  onCheckedChange={(checked) => handleInputChange("enableR2", checked)}
                />
                <Label htmlFor="enableR2" className="flex items-center gap-2 cursor-pointer">
                  <Cloud className="h-4 w-4" />
                  Cloudflare R2
                </Label>
              </div>

              <div className="flex items-center space-x-2 opacity-50">
                <Checkbox
                  id="enableOneDrive"
                  checked={false}
                  disabled={true}
                />
                <Label htmlFor="enableOneDrive" className="flex items-center gap-2 cursor-not-allowed">
                  <Cloud className="h-4 w-4" />
                  OneDrive
                  <Badge variant="outline" className="ml-2 text-xs">
                    <Clock className="h-3 w-3 mr-1" />
                    敬请期待
                  </Badge>
                </Label>
              </div>
            </div>
          </div>

          {formData.enableLocal && (
            <Card className="bg-muted/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <HardDrive className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">本地存储</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  文件将存储在服务器的本地文件系统中。适用于开发环境和小型部署。
                </p>
              </CardContent>
            </Card>
          )}

          {formData.enableR2 && (
            <>
              <Separator />
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Cloud className="h-5 w-5 text-primary" />
                  <span className="font-medium text-base">Cloudflare R2 配置</span>
                </div>

                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="r2Endpoint">R2 端点</Label>
                    <Input
                      id="r2Endpoint"
                      value={formData.r2Endpoint}
                      onChange={(e) => handleInputChange("r2Endpoint", e.target.value)}
                      placeholder="https://your-account-id.r2.cloudflarestorage.com"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="r2Bucket">存储桶名称</Label>
                    <Input
                      id="r2Bucket"
                      value={formData.r2Bucket}
                      onChange={(e) => handleInputChange("r2Bucket", e.target.value)}
                      placeholder="your-bucket-name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="r2AccessKey">访问密钥 ID</Label>
                    <Input
                      id="r2AccessKey"
                      type="password"
                      value={formData.r2AccessKey}
                      onChange={(e) => handleInputChange("r2AccessKey", e.target.value)}
                      placeholder="输入访问密钥"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="r2SecretKey">秘密访问密钥</Label>
                    <Input
                      id="r2SecretKey"
                      type="password"
                      value={formData.r2SecretKey}
                      onChange={(e) => handleInputChange("r2SecretKey", e.target.value)}
                      placeholder="输入秘密密钥"
                    />
                  </div>
                </div>

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    确保您的 R2 存储桶已正确配置，且凭据具有读取、写入和删除操作的必要权限。
                  </AlertDescription>
                </Alert>
              </div>
            </>
          )}

          {formData.enableOneDrive && (
            <>
              <Separator />
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Cloud className="h-5 w-5 text-blue-600" />
                  <h3 className="text-lg font-medium">OneDrive 配置</h3>
                </div>

                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="oneDriveClientId">应用程序 ID (Client ID)</Label>
                    <Input
                      id="oneDriveClientId"
                      value={formData.oneDriveClientId}
                      onChange={(e) => handleInputChange("oneDriveClientId", e.target.value)}
                      placeholder="输入 Azure 应用程序 ID"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="oneDriveClientSecret">客户端密钥 (Client Secret)</Label>
                    <Input
                      id="oneDriveClientSecret"
                      type="password"
                      value={formData.oneDriveClientSecret}
                      onChange={(e) => handleInputChange("oneDriveClientSecret", e.target.value)}
                      placeholder="输入客户端密钥"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="oneDriveTenantId">租户 ID (Tenant ID)</Label>
                    <Input
                      id="oneDriveTenantId"
                      value={formData.oneDriveTenantId}
                      onChange={(e) => handleInputChange("oneDriveTenantId", e.target.value)}
                      placeholder="输入租户 ID 或使用 'common'"
                    />
                    <p className="text-xs text-muted-foreground">
                      使用 'common' 支持个人和工作账户，或输入特定的租户 ID
                    </p>
                  </div>
                </div>

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    请确保在 Azure 门户中正确配置了应用程序权限，包括 Files.ReadWrite.All 权限，
                    并设置了正确的重定向 URI。
                  </AlertDescription>
                </Alert>
              </div>
            </>
          )}

          <div className="flex justify-end pt-4">
            <Button onClick={handleSave} disabled={saving} className="flex items-center gap-2">
              <Save className="h-4 w-4" />
              {saving ? "保存中..." : "保存配置"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>重要说明</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">存储迁移</p>
              <p className="text-muted-foreground">
                更改存储类型不会迁移现有文件。新上传的文件将使用选定的存储后端。
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-blue-500 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">R2 设置</p>
              <p className="text-muted-foreground">
                对于 Cloudflare R2，请创建具有 R2:Edit 权限的 API 令牌，并为您的存储桶配置适当的 CORS 设置。
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Clock className="h-4 w-4 text-orange-500 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">OneDrive 功能</p>
              <p className="text-muted-foreground">
                OneDrive 存储功能正在开发中，将支持与 Microsoft OneDrive 的无缝集成。
                敬请期待后续版本更新。
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
