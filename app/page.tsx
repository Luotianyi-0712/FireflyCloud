"use client"

import { useAuth } from "@/components/auth/auth-provider"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Cloud,
  Shield,
  Zap,
  ArrowRight,
  CheckCircle,
  Upload,
  Download,
  Users,
  Globe,
  Star,
  Sparkles
} from "lucide-react"

export default function HomePage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user) {
      router.push("/dashboard")
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (user) {
    return null
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-14 items-center px-4">
          <div className="mr-4 flex">
            <div className="flex items-center space-x-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <Cloud className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-bold">FireflyCloud</span>
            </div>
          </div>
          <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
            <nav className="flex items-center space-x-2">
              <Button variant="ghost" onClick={() => router.push("/login")}>
                登录
              </Button>
              <Button onClick={() => router.push("/register")}>
                免费注册
              </Button>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="w-full">
        <div className="container mx-auto px-4">
          <div className="mx-auto flex max-w-[980px] flex-col items-center gap-2 py-8 md:py-12 md:pb-8 lg:py-24 lg:pb-20">
            <Badge variant="outline" className="mb-4">
              <Sparkles className="mr-1 h-3 w-3" />
              现代化云存储解决方案
            </Badge>

            <h1 className="text-center text-3xl font-bold leading-tight tracking-tighter md:text-6xl lg:leading-[1.1]">
              <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 bg-clip-text text-transparent">
                安全便捷
              </span>
              的
              <br className="hidden sm:inline" />
              云存储服务
            </h1>

            <p className="max-w-[750px] text-center text-lg text-muted-foreground sm:text-xl">
              支持本地存储和 Cloudflare R2 的专业云存储平台，为个人和团队提供安全、快速、可靠的文件管理体验
            </p>

            <div className="flex w-full items-center justify-center space-x-4 py-4 md:pb-10">
              <Button size="lg" onClick={() => router.push("/register")}>
                立即开始
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button variant="outline" size="lg" onClick={() => router.push("/login")}>
                已有账号？登录
              </Button>
            </div>
          </div>
        </div>
      </section>

      <Separator />

      {/* Stats Section */}
      <section className="w-full">
        <div className="container mx-auto px-4 py-8 md:py-12">
          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 sm:grid-cols-3">
            <div className="flex flex-col items-center space-y-2 border-r">
              <div className="text-3xl font-bold">1%</div>
              <div className="text-sm text-muted-foreground">服务可用性</div>
            </div>
            <div className="flex flex-col items-center space-y-2 border-r">
              <div className="text-3xl font-bold">没有</div>
              <div className="text-sm text-muted-foreground">加密保护</div>
            </div>
            <div className="flex flex-col items-center space-y-2">
              <div className="text-3xl font-bold">24/0</div>
              <div className="text-sm text-muted-foreground">技术支持</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="w-full">
        <div className="container mx-auto px-4 space-y-6 py-8 dark:bg-transparent md:py-12 lg:py-24">
          <div className="mx-auto flex max-w-[58rem] flex-col items-center space-y-4 text-center">
            <h2 className="font-bold text-3xl leading-[1.1] sm:text-3xl md:text-6xl">
              为什么选择 FireflyCloud？
            </h2>
            <p className="max-w-[85%] leading-normal text-muted-foreground sm:text-lg sm:leading-7">
              我们提供企业级的云存储服务，让您的数据管理变得简单高效
            </p>
          </div>

          <div className="mx-auto grid justify-center gap-4 sm:grid-cols-2 md:max-w-[64rem] md:grid-cols-3">
            <Card className="relative overflow-hidden">
              <CardHeader>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
                  <Cloud className="h-6 w-6 text-primary-foreground" />
                </div>
                <CardTitle>双重存储</CardTitle>
                <CardDescription>
                  灵活选择本地存储或 Cloudflare R2 云存储，根据需求无缝切换，确保数据安全可靠
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center space-x-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>支持热切换</span>
                </div>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden">
              <CardHeader>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
                  <Shield className="h-6 w-6 text-primary-foreground" />
                </div>
                <CardTitle>安全访问</CardTitle>
                <CardDescription>
                  基于角色的访问控制，支持管理员和用户权限管理，采用行业标准加密技术保护数据
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center space-x-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>企业级安全</span>
                </div>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden">
              <CardHeader>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
                  <Zap className="h-6 w-6 text-primary-foreground" />
                </div>
                <CardTitle>快速可靠</CardTitle>
                <CardDescription>
                  采用现代化技术架构，提供高性能文件传输，支持大文件上传下载，稳定可靠
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center space-x-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>高速传输</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <Separator />

      {/* Additional Features */}
      <section className="w-full">
        <div className="container mx-auto px-4 py-8 md:py-12">
          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col items-center space-y-2 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                <Upload className="h-6 w-6" />
              </div>
              <h3 className="font-semibold">快速上传</h3>
              <p className="text-sm text-muted-foreground">支持拖拽上传，批量处理</p>
            </div>
            <div className="flex flex-col items-center space-y-2 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                <Download className="h-6 w-6" />
              </div>
              <h3 className="font-semibold">便捷下载</h3>
              <p className="text-sm text-muted-foreground">一键下载，支持断点续传</p>
            </div>
            <div className="flex flex-col items-center space-y-2 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                <Users className="h-6 w-6" />
              </div>
              <h3 className="font-semibold">团队协作</h3>
              <p className="text-sm text-muted-foreground">多用户管理，权限控制</p>
            </div>
            <div className="flex flex-col items-center space-y-2 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                <Globe className="h-6 w-6" />
              </div>
              <h3 className="font-semibold">全球访问</h3>
              <p className="text-sm text-muted-foreground">CDN 加速，全球可达</p>
            </div>
          </div>
        </div>
      </section>

      <Separator />

      {/* CTA Section */}
      <section className="w-full">
        <div className="container mx-auto px-4 py-8 md:py-12">
          <div className="mx-auto flex max-w-[58rem] flex-col items-center justify-center gap-4 text-center">
            <h2 className="font-bold text-3xl leading-[1.1] sm:text-3xl md:text-6xl">
              准备开始使用了吗？
            </h2>
            <p className="max-w-[85%] leading-normal text-muted-foreground sm:text-lg sm:leading-7">
              立即注册，享受专业的云存储服务，让文件管理变得简单高效
            </p>
            <div className="flex w-full items-center justify-center space-x-4 py-4">
              <Button size="lg" onClick={() => router.push("/register")}>
                免费开始使用
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button variant="outline" size="lg" onClick={() => router.push("/login")}>
                登录现有账户
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full border-t py-6 md:py-0">
        <div className="container mx-auto px-4 flex flex-col items-center justify-between gap-4 md:h-24 md:flex-row">
          <div className="flex flex-col items-center gap-4 px-8 md:flex-row md:gap-2 md:px-0">
            <div className="flex items-center space-x-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary">
                <Cloud className="h-3 w-3 text-primary-foreground" />
              </div>
              <span className="font-bold">FireflyCloud</span>
            </div>
            <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
              现代化云存储解决方案
            </p>
          </div>
          <div className="flex items-center space-x-1">
            <Badge variant="outline" className="text-xs">
              <Star className="mr-1 h-3 w-3" />
              企业级
            </Badge>
          </div>
        </div>
      </footer>
    </div>
  )
}
