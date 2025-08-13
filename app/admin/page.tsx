"use client"

import { ProtectedRoute } from "@/components/auth/protected-route"
import { AppLayout } from "@/components/layout/app-layout"
import { AdminDashboard } from "@/components/admin/admin-dashboard"

export default function AdminPage() {
  return (
    <ProtectedRoute requireAdmin>
      <AppLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">管理面板</h1>
            <p className="text-muted-foreground mt-2">管理用户、文件和系统设置</p>
          </div>
          <AdminDashboard />
        </div>
      </AppLayout>
    </ProtectedRoute>
  )
}
