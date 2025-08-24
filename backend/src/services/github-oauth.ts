import { logger } from "../utils/logger"

export interface GitHubOAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export interface GitHubUserInfo {
  id: number
  login: string
  email: string
  name: string
  avatar_url?: string
  type: string
  site_admin?: boolean
}

export interface GitHubUserEmail {
  email: string
  verified: boolean
  primary: boolean
  visibility?: string
}

export class GitHubOAuthService {
  private config: GitHubOAuthConfig

  constructor(config: GitHubOAuthConfig) {
    this.config = config
  }

  /**
   * 生成GitHub OAuth授权URL
   */
  getAuthUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: 'read:user user:email',
      state: state || ''
    })

    return `https://github.com/login/oauth/authorize?${params.toString()}`
  }

  /**
   * 使用授权码获取访问令牌
   */
  async getAccessToken(code: string): Promise<{
    access_token: string
    token_type: string
    scope: string
  }> {
    try {
      const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          code,
          redirect_uri: this.config.redirectUri,
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        logger.error('获取GitHub访问令牌失败:', error)
        throw new Error('获取访问令牌失败')
      }

      const data = await response.json()
      
      if (data.error) {
        logger.error('GitHub OAuth错误:', data.error_description || data.error)
        throw new Error(data.error_description || 'GitHub OAuth认证失败')
      }

      return data
    } catch (error) {
      logger.error('GitHub OAuth令牌交换失败:', error)
      throw error
    }
  }

  /**
   * 使用访问令牌获取用户信息
   */
  async getUserInfo(accessToken: string): Promise<GitHubUserInfo> {
    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'FireflyCloud-OAuth-App'
        },
      })

      if (!response.ok) {
        const error = await response.text()
        logger.error('获取GitHub用户信息失败:', error)
        throw new Error('获取用户信息失败')
      }

      return await response.json()
    } catch (error) {
      logger.error('获取GitHub用户信息失败:', error)
      throw error
    }
  }

  /**
   * 获取用户邮箱列表
   */
  async getUserEmails(accessToken: string): Promise<GitHubUserEmail[]> {
    try {
      const response = await fetch('https://api.github.com/user/emails', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'FireflyCloud-OAuth-App'
        },
      })

      if (!response.ok) {
        const error = await response.text()
        logger.error('获取GitHub用户邮箱失败:', error)
        throw new Error('获取用户邮箱失败')
      }

      return await response.json()
    } catch (error) {
      logger.error('获取GitHub用户邮箱失败:', error)
      throw error
    }
  }

  /**
   * 获取用户的主要邮箱
   */
  async getPrimaryEmail(accessToken: string): Promise<string> {
    try {
      // 首先尝试从用户信息中获取邮箱
      const userInfo = await this.getUserInfo(accessToken)
      if (userInfo.email) {
        return userInfo.email
      }

      // 如果用户信息中没有邮箱，从邮箱列表中获取
      const emails = await this.getUserEmails(accessToken)
      
      // 寻找已验证的主邮箱
      const primaryEmail = emails.find(email => email.primary && email.verified)
      if (primaryEmail) {
        return primaryEmail.email
      }

      // 寻找任何已验证的邮箱
      const verifiedEmail = emails.find(email => email.verified)
      if (verifiedEmail) {
        return verifiedEmail.email
      }

      // 如果没有验证的邮箱，抛出错误
      throw new Error('GitHub账户没有已验证的邮箱地址')
    } catch (error) {
      logger.error('获取GitHub用户主邮箱失败:', error)
      throw error
    }
  }
} 