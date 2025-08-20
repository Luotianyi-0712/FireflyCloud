"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { R2MountManagement } from "./r2-mount-management"
import { OneDriveMountManagement } from "./onedrive-mount-management"
import { Cloud, HardDrive } from "lucide-react"
import { useIsMobile } from "@/components/ui/use-mobile"

export function MountManagement() {
  const [activeTab, setActiveTab] = useState("r2")
  const isMobile = useIsMobile()

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <CardHeader className="pb-4 sm:pb-6">
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <HardDrive className="h-4 w-4 sm:h-5 sm:w-5" />
            存储挂载管理
          </CardTitle>
          <CardDescription className="text-sm">
            统一管理所有外部存储挂载点，包括 Cloudflare R2 和 OneDrive
          </CardDescription>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 h-auto">
              <TabsTrigger 
                value="r2" 
                className={`flex items-center gap-1 sm:gap-2 py-2 sm:py-3 text-xs sm:text-sm ${
                  isMobile ? 'px-2' : 'px-4'
                }`}
              >
                <Cloud className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="truncate">R2 挂载</span>
              </TabsTrigger>
              <TabsTrigger 
                value="onedrive" 
                className={`flex items-center gap-1 sm:gap-2 py-2 sm:py-3 text-xs sm:text-sm ${
                  isMobile ? 'px-2' : 'px-4'
                }`}
              >
                <Cloud className="h-3 w-3 sm:h-4 sm:w-4 text-blue-600" />
                <span className="truncate">OneDrive 挂载</span>
              </TabsTrigger>
            </TabsList>
            
            <div className="mt-4 sm:mt-6">
              <TabsContent value="r2" className="space-y-4 mt-0">
                <R2MountManagement />
              </TabsContent>
              
              <TabsContent value="onedrive" className="space-y-4 mt-0">
                <OneDriveMountManagement />
              </TabsContent>
            </div>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
