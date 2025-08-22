"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/components/auth/auth-provider"
import { AlertCircle, CheckCircle, ExternalLink, Copy } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface GoogleOAuthConfig {
  enabled: boolean
  clientId: string
  clientSecret: string
  redirectUri: string
}

export function GoogleOAuthConfiguration() {
  const [config, setConfig] = useState<GoogleOAuthConfig>({
    enabled: false,
    clientId: "",
    clientSecret: "",
    redirectUri: ""
  })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testingConnection, setTestingConnection] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const { token } = useAuth()
  const { toast } = useToast()

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"

  // 生成默认的重定向URI
  const defaultRedirectUri = typeof window !== 'undefined' 
    ? `${window.location.origin}/auth/google/callback`
    : ""

  useEffect(() => {
    if (defaultRedirectUri && !config.redirectUri) {
      setConfig(prev => ({ ...prev, redirectUri: defaultRedirectUri }))
    }
  }, [defaultRedirectUri])

  useEffect(() => {
    fetchConfig()
  }, [])

  const fetchConfig = async () => {
    if (!token) return

    setLoading(true)
    try {
      const response = await fetch(`${API_URL}/admin/google-oauth-config`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        const loaded: GoogleOAuthConfig = data.config || {
          enabled: false,
          clientId: "",
          clientSecret: "",
          redirectUri: defaultRedirectUri
        }

        // 如果是本地环境且端口不一致，使用当前站点的回调地址
        let nextRedirect = loaded.redirectUri || defaultRedirectUri
        try {
          if (loaded.redirectUri && defaultRedirectUri) {
            const isLoadedLocal = loaded.redirectUri.startsWith('http://localhost') || loaded.redirectUri.startsWith('https://localhost')
            const isDefaultLocal = defaultRedirectUri.startsWith('http://localhost') || defaultRedirectUri.startsWith('https://localhost')
            if (isLoadedLocal && isDefaultLocal) {
              const loadedOrigin = new URL(loaded.redirectUri).origin
              const currentOrigin = new URL(defaultRedirectUri).origin
              if (loadedOrigin !== currentOrigin) {
                nextRedirect = defaultRedirectUri
              }
            }
          }
        } catch {}

        setConfig({
          enabled: loaded.enabled,
          clientId: loaded.clientId,
          clientSecret: loaded.clientSecret,
          redirectUri: nextRedirect,
        })
      } else {
        setError("获取配置失败")
      }
    } catch (err) {
      setError("网络错误，请稍后重试")
    } finally {
      setLoading(false)
    }
  }

  const saveConfig = async () => {
    if (!token) return

    // 验证必填字段
    if (config.enabled && (!config.clientId || !config.clientSecret || !config.redirectUri)) {
      setError("启用谷歌OAuth时，所有配置项都是必填的")
      return
    }

    setSaving(true)
    setError("")
    setSuccess("")

    try {
      const response = await fetch(`${API_URL}/admin/google-oauth-config`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(config),
      })

      if (response.ok) {
        setSuccess("谷歌OAuth配置已保存")
        toast({
          title: "配置已保存",
          description: "谷歌OAuth配置已成功更新",
        })
      } else {
        const errorData = await response.json()
        setError(errorData.error || "保存配置失败")
      }
    } catch (err) {
      setError("网络错误，请稍后重试")
    } finally {
      setSaving(false)
    }
  }

  const testConnection = async () => {
    if (!config.clientId || !config.clientSecret || !config.redirectUri) {
      setError("请先填写完整的配置信息")
      return
    }

    setTestingConnection(true)
    setError("")
    setSuccess("")

    try {
      const response = await fetch(`${API_URL}/admin/test-google-oauth`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          redirectUri: config.redirectUri
        }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setSuccess("谷歌OAuth配置测试成功")
          toast({
            title: "测试成功",
            description: "谷歌OAuth配置有效",
          })
        } else {
          setError(data.error || "配置测试失败")
        }
      } else {
        const errorData = await response.json()
        setError(errorData.error || "测试连接失败")
      }
    } catch (err) {
      setError("网络错误，请稍后重试")
    } finally {
      setTestingConnection(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast({
      title: "已复制",
      description: "内容已复制到剪贴板",
    })
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>谷歌OAuth配置</CardTitle>
          <CardDescription>配置谷歌账号登录功能</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-muted-foreground">加载中...</div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          谷歌OAuth配置
          {config.enabled ? (
            <Badge variant="default" className="bg-green-500">
              <CheckCircle className="w-3 h-3 mr-1" />
              已启用
            </Badge>
          ) : (
            <Badge variant="secondary">已禁用</Badge>
          )}
        </CardTitle>
        <CardDescription>
          配置谷歌账号登录功能，允许用户使用谷歌账户快速登录
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        {/* 启用开关 */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-base">启用谷歌OAuth登录</Label>
            <div className="text-sm text-muted-foreground">
              允许用户使用谷歌账户登录系统
            </div>
          </div>
          <Switch
            checked={config.enabled}
            onCheckedChange={(checked) =>
              setConfig(prev => ({ ...prev, enabled: checked }))
            }
          />
        </div>

        <Separator />

        {/* 配置说明 */}
        <div className="bg-muted/50 p-4 rounded-lg">
          <h4 className="font-medium mb-2">配置步骤：</h4>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>访问 <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">Google Cloud Console <ExternalLink className="w-3 h-3" /></a></li>
            <li>创建新项目或选择现有项目</li>
            <li>启用 Google+ API 和 OAuth2 API</li>
            <li>创建 OAuth 2.0 客户端ID凭据</li>
            <li>将下方的重定向URI添加到授权重定向URI列表中</li>
            <li>复制客户端ID和客户端密钥到下方配置中</li>
          </ol>
        </div>

        {/* 重定向URI */}
        <div className="space-y-2">
          <Label htmlFor="redirectUri">授权重定向URI</Label>
          <div className="flex gap-2">
            <Input
              id="redirectUri"
              value={config.redirectUri}
              onChange={(e) =>
                setConfig(prev => ({ ...prev, redirectUri: e.target.value }))
              }
              placeholder="https://yourdomain.com/auth/google/callback"
              disabled={!config.enabled}
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => copyToClipboard(config.redirectUri)}
              disabled={!config.redirectUri}
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">
            建议使用当前站点：{defaultRedirectUri}
          </div>
        </div>

        {/* 客户端ID */}
        <div className="space-y-2">
          <Label htmlFor="clientId">客户端ID</Label>
          <Input
            id="clientId"
            value={config.clientId}
            onChange={(e) =>
              setConfig(prev => ({ ...prev, clientId: e.target.value }))
            }
            placeholder="your-google-client-id.googleusercontent.com"
            disabled={!config.enabled}
          />
        </div>

        {/* 客户端密钥 */}
        <div className="space-y-2">
          <Label htmlFor="clientSecret">客户端密钥</Label>
          <Input
            id="clientSecret"
            type="password"
            value={config.clientSecret}
            onChange={(e) =>
              setConfig(prev => ({ ...prev, clientSecret: e.target.value }))
            }
            placeholder="your-google-client-secret"
            disabled={!config.enabled}
          />
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-3">
          <Button
            onClick={testConnection}
            variant="outline"
            disabled={testingConnection || !config.enabled || !config.clientId || !config.clientSecret || !config.redirectUri}
          >
            {testingConnection ? "测试中..." : "测试连接"}
          </Button>
          <Button
            onClick={saveConfig}
            disabled={saving}
          >
            {saving ? "保存中..." : "保存配置"}
          </Button>
        </div>

        {/* 使用说明 */}
        {config.enabled && (
          <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg">
            <h4 className="font-medium mb-2 text-blue-900 dark:text-blue-100">使用说明：</h4>
            <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
              <li>用户可以在登录页面点击"使用谷歌账号登录"按钮</li>
              <li>系统会自动获取谷歌账户的邮箱地址作为用户名</li>
              <li>首次使用谷歌登录的用户会自动创建账户</li>
              <li>谷歌账户的邮箱必须已验证才能登录</li>
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
