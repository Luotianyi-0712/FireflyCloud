import axios, { AxiosInstance } from "axios"
import { logger } from "../utils/logger"

export interface OneDriveConfig {
  clientId: string
  clientSecret: string
  tenantId: string
}

export interface OneDriveAuthTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
  scope: string
}

export interface OneDriveItem {
  id: string
  name: string
  size?: number
  createdDateTime: string
  lastModifiedDateTime: string
  mimeType?: string
  downloadUrl?: string
  folder?: {
    childCount: number
  }
  file?: {
    mimeType: string
  }
  parentReference?: {
    path: string
    id: string
  }
}

export interface OneDriveUploadSession {
  uploadUrl: string
  expirationDateTime: string
}

export class OneDriveService {
  private config: OneDriveConfig
  private httpClient: AxiosInstance

  constructor(config: OneDriveConfig) {
    this.config = config
    this.httpClient = axios.create({
      baseURL: "https://graph.microsoft.com/v1.0",
      timeout: 30000,
    })
  }

  /**
   * 获取OAuth授权URL
   */
  getAuthUrl(redirectUri: string, state?: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: "Files.ReadWrite.All offline_access",
      response_mode: "query",
    })

    if (state) {
      params.append("state", state)
    }

    const authUrl = `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/authorize?${params.toString()}`
    logger.debug(`生成OneDrive授权URL: ${authUrl}`)
    return authUrl
  }

  /**
   * 通过授权码获取访问令牌
   */
  async getTokenFromCode(code: string, redirectUri: string): Promise<OneDriveAuthTokens> {
    try {
      logger.debug("通过授权码获取OneDrive访问令牌")
      
      const response = await axios.post(
        `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/token`,
        new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          code,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      )

      const data = response.data
      const expiresAt = Date.now() + (data.expires_in * 1000)

      logger.info("OneDrive访问令牌获取成功")
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt,
        scope: data.scope,
      }
    } catch (error) {
      logger.error("获取OneDrive访问令牌失败:", error)
      throw new Error("Failed to get OneDrive access token")
    }
  }

  /**
   * 刷新访问令牌
   */
  async refreshToken(refreshToken: string): Promise<OneDriveAuthTokens> {
    try {
      logger.debug("刷新OneDrive访问令牌")
      
      const response = await axios.post(
        `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/token`,
        new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      )

      const data = response.data
      const expiresAt = Date.now() + (data.expires_in * 1000)

      logger.info("OneDrive访问令牌刷新成功")
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken, // 有些情况下不会返回新的refresh_token
        expiresAt,
        scope: data.scope,
      }
    } catch (error) {
      logger.error("刷新OneDrive访问令牌失败:", error)
      throw new Error("Failed to refresh OneDrive access token")
    }
  }

  /**
   * 设置访问令牌
   */
  setAccessToken(accessToken: string) {
    this.httpClient.defaults.headers.common["Authorization"] = `Bearer ${accessToken}`
  }

  /**
   * 获取用户信息
   */
  async getUserInfo(): Promise<any> {
    try {
      logger.debug("获取OneDrive用户信息")
      const response = await this.httpClient.get("/me")
      logger.info("OneDrive用户信息获取成功")
      return response.data
    } catch (error) {
      logger.error("获取OneDrive用户信息失败:", error)
      throw new Error("Failed to get OneDrive user info")
    }
  }

  /**
   * 获取驱动器信息
   */
  async getDriveInfo(): Promise<any> {
    try {
      logger.debug("获取OneDrive驱动器信息")
      const response = await this.httpClient.get("/me/drive")
      logger.info("OneDrive驱动器信息获取成功")
      return response.data
    } catch (error) {
      logger.error("获取OneDrive驱动器信息失败:", error)
      throw new Error("Failed to get OneDrive drive info")
    }
  }

  /**
   * 列出文件夹内容
   */
  async listItems(path: string = "/"): Promise<OneDriveItem[]> {
    try {
      logger.debug(`列出OneDrive文件夹内容: ${path}`)
      
      let endpoint: string
      if (path === "/" || path === "") {
        endpoint = "/me/drive/root/children"
      } else {
        // 移除开头的斜杠
        const cleanPath = path.startsWith("/") ? path.substring(1) : path
        endpoint = `/me/drive/root:/${cleanPath}:/children`
      }

      const response = await this.httpClient.get(endpoint)
      const items = response.data.value || []
      
      logger.info(`OneDrive文件夹内容获取成功: ${items.length} 个项目`)
      return items
    } catch (error) {
      logger.error("列出OneDrive文件夹内容失败:", error)
      throw new Error("Failed to list OneDrive items")
    }
  }

  /**
   * 获取文件夹信息
   */
  async getFolderInfo(path: string): Promise<OneDriveItem> {
    try {
      logger.debug(`获取OneDrive文件夹信息: ${path}`)
      
      let endpoint: string
      if (path === "/" || path === "") {
        endpoint = "/me/drive/root"
      } else {
        const cleanPath = path.startsWith("/") ? path.substring(1) : path
        endpoint = `/me/drive/root:/${cleanPath}`
      }

      const response = await this.httpClient.get(endpoint)
      logger.info("OneDrive文件夹信息获取成功")
      return response.data
    } catch (error) {
      logger.error("获取OneDrive文件夹信息失败:", error)
      throw new Error("Failed to get OneDrive folder info")
    }
  }

  /**
   * 通过ID获取项目信息
   */
  async getItemById(itemId: string): Promise<OneDriveItem> {
    try {
      logger.debug(`通过ID获取OneDrive项目信息: ${itemId}`)
      const response = await this.httpClient.get(`/me/drive/items/${itemId}`)
      logger.info("OneDrive项目信息获取成功")
      return response.data
    } catch (error) {
      logger.error("通过ID获取OneDrive项目信息失败:", error)
      throw new Error("Failed to get OneDrive item by ID")
    }
  }

  /**
   * 通过ID列出文件夹内容
   */
  async listItemsById(itemId: string): Promise<OneDriveItem[]> {
    try {
      logger.debug(`通过ID列出OneDrive文件夹内容: ${itemId}`)
      const response = await this.httpClient.get(`/me/drive/items/${itemId}/children`)
      const items = response.data.value || []

      logger.info(`OneDrive文件夹内容获取成功: ${items.length} 个项目`)
      return items
    } catch (error) {
      logger.error("通过ID列出OneDrive文件夹内容失败:", error)
      throw new Error("Failed to list OneDrive items by ID")
    }
  }

  /**
   * 上传小文件 (< 4MB)
   */
  async uploadSmallFile(file: File, path: string, filename: string): Promise<OneDriveItem> {
    try {
      logger.debug(`上传小文件到OneDrive: ${filename} -> ${path}`)

      const buffer = await file.arrayBuffer()
      const cleanPath = path.startsWith("/") ? path.substring(1) : path
      const fullPath = cleanPath ? `${cleanPath}/${filename}` : filename

      const response = await this.httpClient.put(
        `/me/drive/root:/${fullPath}:/content`,
        buffer,
        {
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
        }
      )

      logger.info(`小文件上传成功: ${filename}`)
      return response.data
    } catch (error) {
      logger.error("上传小文件失败:", error)
      throw new Error("Failed to upload small file to OneDrive")
    }
  }

  /**
   * 创建上传会话 (用于大文件上传)
   */
  async createUploadSession(path: string, filename: string): Promise<OneDriveUploadSession> {
    try {
      logger.debug(`创建OneDrive上传会话: ${filename} -> ${path}`)

      const cleanPath = path.startsWith("/") ? path.substring(1) : path
      const fullPath = cleanPath ? `${cleanPath}/${filename}` : filename

      const response = await this.httpClient.post(
        `/me/drive/root:/${fullPath}:/createUploadSession`,
        {
          item: {
            "@microsoft.graph.conflictBehavior": "replace",
            name: filename,
          },
        }
      )

      logger.info(`OneDrive上传会话创建成功: ${filename}`)
      return response.data
    } catch (error) {
      logger.error("创建OneDrive上传会话失败:", error)
      throw new Error("Failed to create OneDrive upload session")
    }
  }

  /**
   * 上传文件块
   */
  async uploadChunk(
    uploadUrl: string,
    chunk: ArrayBuffer,
    rangeStart: number,
    rangeEnd: number,
    totalSize: number
  ): Promise<any> {
    try {
      logger.debug(`上传文件块: ${rangeStart}-${rangeEnd}/${totalSize}`)

      const response = await axios.put(uploadUrl, chunk, {
        headers: {
          "Content-Range": `bytes ${rangeStart}-${rangeEnd}/${totalSize}`,
          "Content-Length": chunk.byteLength.toString(),
        },
      })

      return response.data
    } catch (error) {
      logger.error("上传文件块失败:", error)
      throw new Error("Failed to upload chunk to OneDrive")
    }
  }

  /**
   * 上传大文件 (>= 4MB)
   */
  async uploadLargeFile(file: File, path: string, filename: string): Promise<OneDriveItem> {
    try {
      logger.debug(`上传大文件到OneDrive: ${filename} (${file.size} bytes)`)

      // 创建上传会话
      const session = await this.createUploadSession(path, filename)

      const buffer = await file.arrayBuffer()
      const chunkSize = 320 * 1024 * 10 // 3.2MB chunks
      let uploadedBytes = 0

      while (uploadedBytes < buffer.byteLength) {
        const start = uploadedBytes
        const end = Math.min(uploadedBytes + chunkSize - 1, buffer.byteLength - 1)
        const chunk = buffer.slice(start, end + 1)

        const result = await this.uploadChunk(
          session.uploadUrl,
          chunk,
          start,
          end,
          buffer.byteLength
        )

        uploadedBytes = end + 1

        // 如果上传完成，返回文件信息
        if (result.id) {
          logger.info(`大文件上传成功: ${filename}`)
          return result
        }
      }

      throw new Error("Upload completed but no file info returned")
    } catch (error) {
      logger.error("上传大文件失败:", error)
      throw new Error("Failed to upload large file to OneDrive")
    }
  }

  /**
   * 上传文件 (自动选择小文件或大文件上传)
   */
  async uploadFile(file: File, path: string, filename: string): Promise<OneDriveItem> {
    const maxSmallFileSize = 4 * 1024 * 1024 // 4MB

    if (file.size < maxSmallFileSize) {
      return this.uploadSmallFile(file, path, filename)
    } else {
      return this.uploadLargeFile(file, path, filename)
    }
  }

  /**
   * 下载文件
   */
  async downloadFile(itemId: string): Promise<Buffer> {
    try {
      logger.debug(`下载OneDrive文件: ${itemId}`)

      // 首先获取下载URL
      const response = await this.httpClient.get(`/me/drive/items/${itemId}/content`, {
        maxRedirects: 0,
        validateStatus: (status) => status === 302,
      })

      const downloadUrl = response.headers.location
      if (!downloadUrl) {
        throw new Error("No download URL found")
      }

      // 下载文件内容
      const fileResponse = await axios.get(downloadUrl, {
        responseType: "arraybuffer",
      })

      logger.info(`OneDrive文件下载成功: ${itemId}`)
      return Buffer.from(fileResponse.data)
    } catch (error) {
      logger.error("下载OneDrive文件失败:", error)
      throw new Error("Failed to download file from OneDrive")
    }
  }

  /**
   * 获取文件下载URL
   */
  async getDownloadUrl(itemId: string): Promise<string> {
    try {
      logger.debug(`获取OneDrive文件下载URL: ${itemId}`)

      const response = await this.httpClient.get(`/me/drive/items/${itemId}/content`, {
        maxRedirects: 0,
        validateStatus: (status) => status === 302,
      })

      const downloadUrl = response.headers.location
      if (!downloadUrl) {
        throw new Error("No download URL found")
      }

      logger.info(`OneDrive文件下载URL获取成功: ${itemId}`)
      return downloadUrl
    } catch (error) {
      logger.error("获取OneDrive文件下载URL失败:", error)
      throw new Error("Failed to get download URL from OneDrive")
    }
  }

  /**
   * 删除文件或文件夹
   */
  async deleteItem(itemId: string): Promise<void> {
    try {
      logger.debug(`删除OneDrive项目: ${itemId}`)
      await this.httpClient.delete(`/me/drive/items/${itemId}`)
      logger.info(`OneDrive项目删除成功: ${itemId}`)
    } catch (error) {
      logger.error("删除OneDrive项目失败:", error)
      throw new Error("Failed to delete OneDrive item")
    }
  }

  /**
   * 创建文件夹
   */
  async createFolder(parentPath: string, folderName: string): Promise<OneDriveItem> {
    try {
      logger.debug(`创建OneDrive文件夹: ${folderName} in ${parentPath}`)

      let endpoint: string
      if (parentPath === "/" || parentPath === "") {
        endpoint = "/me/drive/root/children"
      } else {
        const cleanPath = parentPath.startsWith("/") ? parentPath.substring(1) : parentPath
        endpoint = `/me/drive/root:/${cleanPath}:/children`
      }

      const response = await this.httpClient.post(endpoint, {
        name: folderName,
        folder: {},
        "@microsoft.graph.conflictBehavior": "rename",
      })

      logger.info(`OneDrive文件夹创建成功: ${folderName}`)
      return response.data
    } catch (error) {
      logger.error("创建OneDrive文件夹失败:", error)
      throw new Error("Failed to create OneDrive folder")
    }
  }
}
