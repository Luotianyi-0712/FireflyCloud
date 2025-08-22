"use client"

import type React from "react"

import { useState, useEffect, Suspense } from "react"
import { useAuth } from "@/components/auth/auth-provider"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { Eye, EyeOff, Cloud } from "lucide-react"
import Link from "next/link"

function LoginContent() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [googleEnabled, setGoogleEnabled] = useState(false)

  const { login, loginWithGoogle, getGoogleAuthUrl } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"

  // 检查谷歌OAuth是否启用
  useEffect(() => {
    const checkGoogleOAuth = async () => {
      try {
        const response = await fetch(`${API_URL}/auth/google-oauth-status`)
        if (response.ok) {
          const data = await response.json()
          setGoogleEnabled(data.enabled && data.configured)
        }
      } catch (error) {
        console.error("检查谷歌OAuth状态失败:", error)
      }
    }
    checkGoogleOAuth()
  }, [])

  // 处理谷歌OAuth回调
  useEffect(() => {
    const code = searchParams.get('code')
    const error = searchParams.get('error')
    
    if (error) {
      setError('谷歌登录被取消或失败')
      return
    }
    
    if (code) {
      handleGoogleCallback(code)
    }
  }, [searchParams])

  const handleGoogleCallback = async (code: string) => {
    setGoogleLoading(true)
    setError("")
    
    try {
      await loginWithGoogle(code)
      router.push("/dashboard")
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError("谷歌登录失败，请稍后重试")
      }
    } finally {
      setGoogleLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setGoogleLoading(true)
    setError("")
    
    try {
      const authUrl = await getGoogleAuthUrl()
      window.location.href = authUrl
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError("获取谷歌授权链接失败")
      }
      setGoogleLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    // 基本验证
    if (!email.trim()) {
      setError("请输入邮箱地址")
      setLoading(false)
      return
    }

    if (!password.trim()) {
      setError("请输入密码")
      setLoading(false)
      return
    }

    try {
      await login(email, password)
      router.push("/dashboard")
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError("登录失败，请检查您的网络连接")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        {/* Logo and Brand */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary mb-4">
            <Cloud className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">FireflyCloud</h1>
          <p className="text-muted-foreground text-sm"></p>
        </div>

        <Card className="w-full">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">
              登录账户
            </CardTitle>
            <CardDescription>输入您的凭据以访问 FireflyCloud</CardDescription>
          </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">邮箱地址</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="请输入您的邮箱地址"
                required
                disabled={loading || googleLoading}
                className={error && !email.trim() ? "border-red-500 focus:border-red-500" : ""}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入您的密码"
                  required
                  disabled={loading || googleLoading}
                  className={error && !password.trim() ? "border-red-500 focus:border-red-500" : ""}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={loading || googleLoading}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading || googleLoading}>
              {loading ? "登录中..." : "登录"}
            </Button>
          </form>

          {/* 谷歌登录分隔线 */}
          {googleEnabled && (
            <>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <Separator className="w-full" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">或</span>
                </div>
              </div>

              {/* 谷歌登录按钮 */}
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleGoogleLogin}
                disabled={loading || googleLoading}
              >
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                {googleLoading ? "连接中..." : "使用谷歌账号登录"}
              </Button>
            </>
          )}

          <div className="mt-6 text-center text-sm">
            <p className="text-muted-foreground">
              还没有账户？{" "}
              <Link href="/register" className="text-primary hover:underline">
                立即注册
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  )
}