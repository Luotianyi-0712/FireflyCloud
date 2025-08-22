"use client"

import { ProtectedRoute } from "@/components/auth/protected-route"
import { AppLayout } from "@/components/layout/app-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from "@/components/ui/breadcrumb"
import { Cloud } from "lucide-react"
import { GoogleOAuthConfiguration } from "@/components/admin/google-oauth-configuration"

export default function AdminOAuthPage() {
  return (
    <ProtectedRoute requireAdmin>
      <AppLayout>
        <div className="space-y-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage className="flex items-center gap-1">
                  <Cloud className="h-4 w-4" />
                  OAuth配置
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">OAuth配置</h1>
            <p className="text-sm sm:text-base text-muted-foreground">配置谷歌 OAuth 登录</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Google OAuth</CardTitle>
              <CardDescription>配置 Google OAuth 客户端与回调</CardDescription>
            </CardHeader>
            <CardContent>
              <GoogleOAuthConfiguration />
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    </ProtectedRoute>
  )
} 