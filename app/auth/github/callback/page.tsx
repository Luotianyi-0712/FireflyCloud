"use client"

import { useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/components/auth/auth-provider"

export default function GitHubCallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { loginWithGitHub } = useAuth()

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code')
      const error = searchParams.get('error')

      if (error) {
        console.error('GitHub OAuth error:', error)
        router.push('/login?error=github_oauth_failed')
        return
      }

      if (!code) {
        console.error('No authorization code received')
        router.push('/login?error=github_oauth_failed')
        return
      }

      try {
        await loginWithGitHub(code)
        router.push('/dashboard')
      } catch (error) {
        console.error('GitHub OAuth callback error:', error)
        router.push('/login?error=github_oauth_failed')
      }
    }

    handleCallback()
  }, [searchParams, router, loginWithGitHub])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
        <p className="mt-4 text-muted-foreground">正在处理GitHub登录...</p>
      </div>
    </div>
  )
} 