"use client"

import { useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, AlertCircle, CheckCircle } from "lucide-react"

export default function GoogleCallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const code = searchParams.get('code')
    const error = searchParams.get('error')
    const state = searchParams.get('state')

    if (error) {
      // 谷歌OAuth错误，重定向到登录页面并显示错误
      router.push(`/login?error=${encodeURIComponent('谷歌登录被取消或失败')}`)
      return
    }

    if (code) {
      // 成功获取授权码，重定向到登录页面进行处理
      router.push(`/login?code=${encodeURIComponent(code)}`)
      return
    }

    // 没有code也没有error，可能是直接访问了这个页面
    router.push('/login')
  }, [searchParams, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            处理谷歌登录
          </CardTitle>
          <CardDescription>
            正在处理您的谷歌账户登录...
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center text-sm text-muted-foreground">
            请稍候，我们正在验证您的谷歌账户信息
          </div>
        </CardContent>
      </Card>
    </div>
  )
}