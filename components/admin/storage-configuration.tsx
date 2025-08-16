"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/components/auth/auth-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"
import { HardDrive, Cloud, Save, CheckCircle, AlertCircle, Link } from "lucide-react"

interface StorageConfig {
  storageType: "local" | "r2"
  r2Endpoint: string
  r2Bucket: string
  enableMixedMode: boolean
}

export function StorageConfiguration() {
  const [config, setConfig] = useState<StorageConfig>({
    storageType: "local",
    r2Endpoint: "",
    r2Bucket: "",
    enableMixedMode: false,
  })
  const [formData, setFormData] = useState({
    storageType: "local",
    r2Endpoint: "",
    r2AccessKey: "",
    r2SecretKey: "",
    r2Bucket: "",
    enableMixedMode: false,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
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
        setConfig(data.config)
        setFormData({
          storageType: data.config.storageType,
          r2Endpoint: data.config.r2Endpoint || "",
          r2AccessKey: "",
          r2SecretKey: "",
          r2Bucket: data.config.r2Bucket || "",
          enableMixedMode: data.config.enableMixedMode || false,
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

    setSaving(true)
    setMessage(null)

    try {
      const response = await fetch(`${API_URL}/storage/config`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      })

      if (response.ok) {
        setMessage({ type: "success", text: "存储配置更新成功" })
        fetchConfig()
      } else {
        const errorData = await response.json()
        setMessage({ type: "error", text: errorData.error || "配置更新失败" })
      }
    } catch (error) {
      setMessage({ type: "error", text: "网络错误" })
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
      {message && (
        <Alert variant={message.type === "error" ? "destructive" : "default"}>
          {message.type === "success" ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            当前存储后端
            <Badge variant={config.storageType === "local" ? "secondary" : "default"}>
              {config.storageType === "local" ? "本地存储" : "Cloudflare R2"}
            </Badge>
          </CardTitle>
          <CardDescription>
            {config.enableMixedMode
              ? "混合模式：同时支持本地存储和 Cloudflare R2"
              : config.storageType === "local"
              ? "文件存储在服务器本地文件系统中"
              : `文件存储在 Cloudflare R2 存储桶：${config.r2Bucket}`}
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
            <Label className="text-base font-medium">存储类型</Label>
            <RadioGroup value={formData.storageType} onValueChange={(value) => handleInputChange("storageType", value)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="local" id="local" />
                <Label htmlFor="local" className="flex items-center gap-2 cursor-pointer">
                  <HardDrive className="h-4 w-4" />
                  本地存储
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="r2" id="r2" />
                <Label htmlFor="r2" className="flex items-center gap-2 cursor-pointer">
                  <Cloud className="h-4 w-4" />
                  Cloudflare R2
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* 混合模式选项 */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="enableMixedMode"
                checked={formData.enableMixedMode}
                onCheckedChange={(checked) => handleInputChange("enableMixedMode", checked)}
              />
              <Label htmlFor="enableMixedMode" className="flex items-center gap-2 cursor-pointer">
                <Link className="h-4 w-4" />
                启用混合模式
              </Label>
            </div>
            <p className="text-sm text-muted-foreground ml-6">
              同时支持本地存储和 Cloudflare R2，可以将 R2 存储桶挂载到本地文件夹中
            </p>
          </div>

          {formData.storageType === "local" && (
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

          {(formData.storageType === "r2" || formData.enableMixedMode) && (
            <>
              <Separator />
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Cloud className="h-5 w-5 text-primary" />
                  <span className="font-medium text-base">Cloudflare R2 配置</span>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
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
        </CardContent>
      </Card>
    </div>
  )
}
