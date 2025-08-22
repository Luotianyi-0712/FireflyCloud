"use client"

import { createContext, useContext, useState, useEffect } from "react"

interface User {
  id: string
  email: string
  role: string
  emailVerified: boolean
  createdAt: number
  updatedAt: number
}

interface AuthContextType {
  user: User | null
  token: string | null
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => void
  loading: boolean
  // 暴露谷歌相关方法
  loginWithGoogle: (code: string) => Promise<void>
  getGoogleAuthUrl: () => Promise<string>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [isClient, setIsClient] = useState(false)

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"

  useEffect(() => {
    setIsClient(true)
    // 只在客户端访问localStorage
    if (typeof window !== 'undefined') {
      const savedToken = localStorage.getItem("token")
      if (savedToken) {
        setToken(savedToken)
        fetchUser(savedToken)
      } else {
        setLoading(false)
      }
    } else {
      setLoading(false)
    }
  }, [])

  const fetchUser = async (authToken: string) => {
    try {
      const response = await fetch(`${API_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setUser(data.user)
      } else {
        if (isClient && typeof window !== 'undefined') {
          localStorage.removeItem("token")
        }
        setToken(null)
      }
    } catch (error) {
      console.error("Failed to fetch user:", error)
      if (isClient && typeof window !== 'undefined') {
        localStorage.removeItem("token")
      }
      setToken(null)
    } finally {
      setLoading(false)
    }
  }

  const login = async (email: string, password: string) => {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || "登录失败，请稍后重试")
    }

    const data = await response.json()
    setToken(data.token)
    setUser(data.user)
    if (isClient && typeof window !== 'undefined') {
      localStorage.setItem("token", data.token)
    }
  }

  const register = async (email: string, password: string) => {
    const response = await fetch(`${API_URL}/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || "注册失败，请稍后重试")
    }

    const data = await response.json()
    setToken(data.token)
    setUser(data.user)
    if (isClient && typeof window !== 'undefined') {
      localStorage.setItem("token", data.token)
    }
  }

  const getGoogleAuthUrl = async (): Promise<string> => {
    // 与 OneDrive 一致：由前端构造当前页面 origin 的 redirectUri 并传递给后端
    const redirectUri = typeof window !== 'undefined'
      ? `${window.location.origin}/auth/google/callback`
      : ''

    const url = `${API_URL}/auth/google-oauth-url${redirectUri ? `?redirectUri=${encodeURIComponent(redirectUri)}` : ''}`
    const response = await fetch(url)
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || "获取谷歌授权链接失败")
    }

    const data = await response.json()
    return data.authUrl
  }

  const loginWithGoogle = async (code: string) => {
    const redirectUri = typeof window !== 'undefined'
      ? `${window.location.origin}/auth/google/callback`
      : ''

    const response = await fetch(`${API_URL}/auth/google-oauth-callback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code, redirectUri }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || "谷歌登录失败，请稍后重试")
    }

    const data = await response.json()
    setToken(data.token)
    setUser(data.user)
    if (isClient && typeof window !== 'undefined') {
      localStorage.setItem("token", data.token)
    }
  }

  const logout = () => {
    setUser(null)
    setToken(null)
    if (isClient && typeof window !== 'undefined') {
      localStorage.removeItem("token")
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        register,
        loginWithGoogle,
        getGoogleAuthUrl,
        logout,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
