"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { R2MountManagement } from "./r2-mount-management"
import { OneDriveMountManagement } from "./onedrive-mount-management"
import { Cloud, HardDrive } from "lucide-react"

export function MountManagement() {
  const [activeTab, setActiveTab] = useState("r2")

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            存储挂载管理
          </CardTitle>
          <CardDescription>
            统一管理所有外部存储挂载点，包括 Cloudflare R2 和 OneDrive
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="r2" className="flex items-center gap-2">
                <Cloud className="h-4 w-4" />
                R2 挂载
              </TabsTrigger>
              <TabsTrigger value="onedrive" className="flex items-center gap-2">
                <Cloud className="h-4 w-4 text-blue-600" />
                OneDrive 挂载
              </TabsTrigger>
            </TabsList>
            
            <div className="mt-6">
              <TabsContent value="r2" className="space-y-4">
                <R2MountManagement />
              </TabsContent>
              
              <TabsContent value="onedrive" className="space-y-4">
                <OneDriveMountManagement />
              </TabsContent>
            </div>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}