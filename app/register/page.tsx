"use client"

import type React from "react"

import { useState } from "react"
import * as React from "react"
import { useAuth } from "@/components/auth/auth-provider"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Eye, EyeOff, Cloud } from "lucide-react"
import Link from "next/link"

export default function RegisterPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [verificationCode, setVerificationCode] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [codeSent, setCodeSent] = useState(false)
  const [countdown, setCountdown] = useState(0)

  const { register } = useAuth()
  const router = useRouter()

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"

  // 倒计时效果
  React.useEffect(() => {
    let timer: NodeJS.Timeout
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000)
    }
    return () => clearTimeout(timer)
  }, [countdown])

  // 发送验证码
  const handleSendCode = async () => {
    if (!email) {
      setError("请先输入邮箱地址")
      return
    }

    setSendingCode(true)
    setError("")

    try {
      const response = await fetch(`${API_URL}/auth/send-verification-code`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (response.ok) {
        setCodeSent(true)
        setCountdown(60) // 60秒倒计时
        setError("")
      } else {
        setError(data.error || "发送验证码失败")
      }
    } catch (err) {
      setError("网络错误，请稍后重试")
    } finally {
      setSendingCode(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!verificationCode) {
      setError("请输入邮箱验证码")
      return
    }

    if (password !== confirmPassword) {
      setError("密码不匹配")
      return
    }

    if (password.length < 6) {
      setError("密码长度至少需要6个字符")
      return
    }

    setLoading(true)

    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          verificationCode
        }),
      })

      const data = await response.json()

      if (response.ok) {
        // 注册成功，保存token并跳转
        localStorage.setItem("token", data.token)
        router.push("/dashboard")
      } else {
        setError(data.error || "注册失败")
      }
    } catch (err) {
      setError("网络错误，请稍后重试")
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
          <p className="text-muted-foreground text-sm">现代化云存储解决方案</p>
        </div>

        <Card className="w-full">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">
              创建账户
            </CardTitle>
            <CardDescription>创建您的 FireflyCloud 账户开始使用</CardDescription>
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
              <div className="flex gap-2">
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSendCode}
                  disabled={sendingCode || countdown > 0 || !email}
                  className="whitespace-nowrap"
                >
                  {sendingCode ? "发送中..." : countdown > 0 ? `${countdown}s` : "发送验证码"}
                </Button>
              </div>
              {codeSent && (
                <p className="text-sm text-muted-foreground">
                  验证码已发送到您的邮箱，请查收
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="verificationCode">邮箱验证码</Label>
              <Input
                id="verificationCode"
                type="text"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                placeholder="请输入6位验证码"
                maxLength={6}
                required
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
                  placeholder="创建密码"
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">确认密码</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="再次输入密码"
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "创建账户中..." : "创建账户"}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm">
            <p className="text-muted-foreground">
              已有账户？{" "}
              <Link href="/login" className="text-primary hover:underline">
                立即登录
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  )
}
