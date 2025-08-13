"use client"

import { ProtectedRoute } from "@/components/auth/protected-route"
import { AppLayout } from "@/components/layout/app-layout"
import { FileManager } from "@/components/files/file-manager"

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">我的文件</h1>
            <p className="text-muted-foreground mt-2">上传、管理和整理您的文件</p>
          </div>
          <FileManager />
        </div>
      </AppLayout>
    </ProtectedRoute>
  )
}
