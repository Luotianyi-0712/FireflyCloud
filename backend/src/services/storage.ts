import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { writeFile, unlink, mkdir } from "fs/promises"
import { existsSync } from "fs"
import path from "path"
import { logger } from "../utils/logger"
import { OneDriveService, OneDriveConfig } from "./onedrive"

// R2存储统计缓存
interface R2StorageCache {
  data: {
    totalSize: number
    totalFiles: number
    error?: string
  }
  timestamp: number
  ttl: number // 缓存生存时间（毫秒）
}

// 全局缓存对象
const r2StorageCache = new Map<string, R2StorageCache>()

export class StorageService {
  private s3Client?: S3Client
  private oneDriveService?: OneDriveService
  private config: any

  constructor(config: any) {
    this.config = config

    if ((config.storageType === "r2" || config.enableMixedMode) && config.r2Endpoint) {
      this.s3Client = new S3Client({
        region: "auto",
        endpoint: config.r2Endpoint,
        credentials: {
          accessKeyId: config.r2AccessKey,
          secretAccessKey: config.r2SecretKey,
        },
      })
    }

    if ((config.storageType === "onedrive" || config.enableMixedMode) && config.oneDriveClientId) {
      this.oneDriveService = new OneDriveService({
        clientId: config.oneDriveClientId,
        clientSecret: config.oneDriveClientSecret,
        tenantId: config.oneDriveTenantId,
      })
    }
  }

  // 设置OneDrive访问令牌
  setOneDriveAccessToken(accessToken: string) {
    if (this.oneDriveService) {
      this.oneDriveService.setAccessToken(accessToken)
    }
  }

  // 获取OneDrive服务实例
  getOneDriveService(): OneDriveService | undefined {
    return this.oneDriveService
  }

  async uploadFile(file: File, filename: string): Promise<string> {
    logger.debug(`开始上传文件: ${filename} 到 ${this.config.storageType} 存储`)

    if (this.config.storageType === "r2" && this.s3Client) {
      return this.uploadToR2(file, filename)
    } else if (this.config.storageType === "onedrive" && this.oneDriveService) {
      return this.uploadToOneDrive(file, filename)
    } else {
      return this.uploadToLocal(file, filename)
    }
  }

  private async uploadToR2(file: File, filename: string): Promise<string> {
    if (!this.s3Client) throw new Error("R2 client not configured")

    logger.debug(`上传文件到 R2: ${filename}`)
    const buffer = await file.arrayBuffer()

    const command = new PutObjectCommand({
      Bucket: this.config.r2Bucket,
      Key: filename,
      Body: new Uint8Array(buffer),
      ContentType: file.type,
    })

    await this.s3Client.send(command)
    logger.info(`文件成功上传到 R2: ${filename}`)
    return filename
  }

  private async uploadToLocal(file: File, filename: string): Promise<string> {
    logger.debug(`上传文件到本地存储: ${filename}`)
    const uploadsDir = path.join(process.cwd(), "uploads")

    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true })
      logger.debug(`创建上传目录: ${uploadsDir}`)
    }

    const filePath = path.join(uploadsDir, filename)
    const buffer = await file.arrayBuffer()

    await writeFile(filePath, new Uint8Array(buffer))
    logger.info(`文件成功上传到本地: ${filePath}`)
    return filePath
  }

  private async uploadToOneDrive(file: File, filename: string): Promise<string> {
    if (!this.oneDriveService) throw new Error("OneDrive service not configured")

    logger.debug(`上传文件到 OneDrive: ${filename}`)

    // 上传到OneDrive根目录
    const result = await this.oneDriveService.uploadFile(file, "/", filename)

    logger.info(`文件成功上传到 OneDrive: ${filename}`)
    return result.id // 返回OneDrive文件ID作为存储路径
  }

  async getDownloadUrl(storagePath: string): Promise<string> {
    logger.debug(`生成下载链接: ${storagePath} (${this.config.storageType})`)

    if (this.config.storageType === "r2" && this.s3Client) {
      const command = new GetObjectCommand({
        Bucket: this.config.r2Bucket,
        Key: storagePath,
      })

      const url = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 })
      logger.info(`生成 R2 下载链接: ${storagePath}`)
      return url
    } else if (this.config.storageType === "onedrive" && this.oneDriveService) {
      const url = await this.oneDriveService.getDownloadUrl(storagePath)
      logger.info(`生成 OneDrive 下载链接: ${storagePath}`)
      return url
    } else {
      // For local storage, return a direct file serving URL
      const url = `/api/files/serve/${path.basename(storagePath)}`
      logger.info(`生成本地下载链接: ${storagePath}`)
      return url
    }
  }

  async deleteFile(storagePath: string): Promise<void> {
    logger.debug(`删除文件: ${storagePath} (${this.config.storageType})`)

    if (this.config.storageType === "r2" && this.s3Client) {
      const command = new DeleteObjectCommand({
        Bucket: this.config.r2Bucket,
        Key: storagePath,
      })

      await this.s3Client.send(command)
      logger.info(`文件从 R2 删除成功: ${storagePath}`)
    } else if (this.config.storageType === "onedrive" && this.oneDriveService) {
      await this.oneDriveService.deleteItem(storagePath)
      logger.info(`文件从 OneDrive 删除成功: ${storagePath}`)
    } else {
      await unlink(storagePath)
      logger.info(`文件从本地删除成功: ${storagePath}`)
    }
  }

  // 浏览 R2 存储桶目录结构
  async listR2Objects(prefix: string = ""): Promise<{ 
    files: any[], 
    folders: string[],
    folderCounts: Record<string, { files: number, folders: number }>
  }> {
    if (!this.s3Client) {
      throw new Error("R2 client not configured")
    }

    // 处理用户输入"/"作为根路径的情况
    if (prefix === "/") {
      prefix = "";
    }

    // 根据Cloudflare R2文档，确保prefix格式正确
    // 空字符串表示根目录，非空时确保以/结尾
    const normalizedPrefix = prefix ? (prefix.endsWith('/') ? prefix : `${prefix}/`) : "";
    
    logger.debug(`浏览 R2 目录: ${normalizedPrefix || "根目录"}`)

    const command = new ListObjectsV2Command({
      Bucket: this.config.r2Bucket,
      Prefix: normalizedPrefix,
      Delimiter: "/",
    })

    const response = await this.s3Client.send(command)

    // 处理文件 - 只包含当前目录下的文件，排除子目录中的文件
    const files = (response.Contents || [])
      .filter(obj => {
        // 排除目录本身和对象键为空的情况
        if (!obj.Key || obj.Key === normalizedPrefix) return false;
        
        // 只显示当前目录直接子文件，排除子目录中的文件
        const relativePath = obj.Key.slice(normalizedPrefix.length);
        return !relativePath.includes('/');
      })
      .map(obj => ({
        key: obj.Key || "",
        size: obj.Size || 0,
        lastModified: obj.LastModified || new Date(),
        etag: obj.ETag || "",
      }))

    // 处理文件夹（CommonPrefixes）
    const folders = (response.CommonPrefixes || [])
      .map(p => p.Prefix || "")
      .filter(prefix => prefix !== "")
    
    logger.info(`R2 目录 ${normalizedPrefix || "根目录"} 包含 ${files.length} 个文件和 ${folders.length} 个文件夹`)
    
    // 计算每个文件夹中的文件和子文件夹数量
    const folderCounts: Record<string, { files: number, folders: number }> = {};
    
    // 为每个文件夹创建计数对象
    folders.forEach(folder => {
      folderCounts[folder] = { files: 0, folders: 0 };
    });
    
    // 获取所有对象（无分隔符）来计算文件夹内容
    try {
      // 创建一个不使用分隔符的查询，获取所有对象
      const listAllCommand = new ListObjectsV2Command({
        Bucket: this.config.r2Bucket,
        Prefix: normalizedPrefix,
        // 不使用分隔符，这样可以获取所有子目录中的对象
      });
      
      const allObjectsResponse = await this.s3Client.send(listAllCommand);
      const allObjects = allObjectsResponse.Contents || [];
      
      // 遍历所有对象，计算每个文件夹的内容数量
      // 创建已存在文件夹的集合，方便快速查找
      const folderSet = new Set(folders);
      
      allObjects.forEach(obj => {
        if (!obj.Key || obj.Key === normalizedPrefix) return;
        
        const relativePath = obj.Key.slice(normalizedPrefix.length);
        const parts = relativePath.split('/');
        
        // 如果是直接文件（没有斜杠），则不计入任何文件夹
        if (parts.length <= 1) return;
        
        // 计算该对象所属的最近一级文件夹
        let currentPath = normalizedPrefix;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!parts[i]) continue;
          
          const folderPath = currentPath + parts[i] + '/';
          
          // 只计算我们已知的第一级文件夹
          if (folderSet.has(folderPath)) {
            if (!folderCounts[folderPath]) {
              folderCounts[folderPath] = { files: 0, folders: 0 };
            }
            folderCounts[folderPath].files++;
            break; // 只计算第一级文件夹
          }
          
          currentPath = folderPath;
        }
      });
      
      // 对于子文件夹，我们需要计算它们出现的次数
      folders.forEach(folder => {
        // 对每个文件夹，计算其他文件夹中以它为前缀的数量
        const subFolders = folders.filter(f => 
          f !== folder && f.startsWith(folder)
        );
        
        if (folderCounts[folder]) {
          folderCounts[folder].folders = subFolders.length;
        }
      });
      
      logger.debug(`已计算文件夹项目数量: ${JSON.stringify(folderCounts)}`);
    } catch (error) {
      logger.error('计算文件夹项目数量时出错:', error);
      // 出错时不影响主要功能继续执行
    }
    
    return { files, folders, folderCounts }
  }

  // 新增：获取 R2 文件的公共下载链接
  async getR2PublicUrl(key: string): Promise<string> {
    if (!this.s3Client) {
      throw new Error("R2 client not configured")
    }

    // 生成预签名 URL，有效期 1 小时
    const command = new GetObjectCommand({
      Bucket: this.config.r2Bucket,
      Key: key,
    })

    const url = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 })
    logger.info(`生成 R2 公共下载链接: ${key}`)
    return url
  }

  // 新增：下载文件内容
  async downloadFile(storagePath: string): Promise<Buffer> {
    logger.debug(`下载文件内容: ${storagePath} (${this.config.storageType})`)

    if (this.config.storageType === "r2" && this.s3Client) {
      const command = new GetObjectCommand({
        Bucket: this.config.r2Bucket,
        Key: storagePath,
      })

      const response = await this.s3Client.send(command)
      if (!response.Body) {
        throw new Error("Empty response body from R2")
      }

      // Convert stream to buffer
      const chunks: Uint8Array[] = []
      
      // Handle the AWS SDK stream properly
      if (response.Body instanceof ReadableStream) {
        const reader = response.Body.getReader()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          chunks.push(value)
        }
      } else {
        // Handle Node.js Readable stream
        const stream = response.Body as any
        for await (const chunk of stream) {
          chunks.push(chunk)
        }
      }

      const buffer = Buffer.concat(chunks)
      logger.info(`成功从 R2 下载文件: ${storagePath}, 大小: ${buffer.length} bytes`)
      return buffer
    } else if (this.config.storageType === "onedrive" && this.oneDriveService) {
      const buffer = await this.oneDriveService.downloadFile(storagePath)
      logger.info(`成功从 OneDrive 下载文件: ${storagePath}, 大小: ${buffer.length} bytes`)
      return buffer
    } else {
      // For local storage, read file directly
      const fs = await import("fs/promises")
      // 检查 storagePath 是否已经是绝对路径
      const filePath = path.isAbsolute(storagePath)
        ? storagePath
        : path.join(process.cwd(), "uploads", storagePath)
      const buffer = await fs.readFile(filePath)
      logger.info(`成功从本地读取文件: ${storagePath}, 大小: ${buffer.length} bytes`)
      return buffer
    }
  }

  // 新增：计算R2存储桶的实际使用量（带缓存）
  async calculateR2StorageUsage(useCache: boolean = true): Promise<{
    totalSize: number
    totalFiles: number
    error?: string
    fromCache?: boolean
  }> {
    if (!this.s3Client) {
      return {
        totalSize: 0,
        totalFiles: 0,
        error: "R2 client not configured"
      }
    }

    const cacheKey = `${this.config.r2Bucket}_storage_usage`
    const cacheTTL = 5 * 60 * 1000 // 5分钟缓存

    // 检查缓存
    if (useCache) {
      const cached = r2StorageCache.get(cacheKey)
      if (cached && (Date.now() - cached.timestamp) < cached.ttl) {
        logger.debug("使用R2存储统计缓存数据")
        return {
          ...cached.data,
          fromCache: true
        }
      }
    }

    try {
      logger.debug("开始计算R2存储桶使用量")

      let totalSize = 0
      let totalFiles = 0
      let continuationToken: string | undefined

      // 使用分页查询遍历所有对象
      do {
        const command = new ListObjectsV2Command({
          Bucket: this.config.r2Bucket,
          ContinuationToken: continuationToken,
          MaxKeys: 1000, // 每次最多获取1000个对象
        })

        const response = await this.s3Client.send(command)

        if (response.Contents) {
          for (const object of response.Contents) {
            if (object.Size) {
              totalSize += object.Size
              totalFiles++
            }
          }
        }

        continuationToken = response.NextContinuationToken

        // 记录进度
        if (response.Contents && response.Contents.length > 0) {
          logger.debug(`已处理 ${totalFiles} 个文件，当前总大小: ${totalSize} 字节`)
        }

      } while (continuationToken)

      logger.info(`R2存储桶使用量计算完成: ${totalFiles} 个文件，总大小: ${totalSize} 字节`)

      const result = {
        totalSize,
        totalFiles
      }

      // 更新缓存
      if (useCache) {
        r2StorageCache.set(cacheKey, {
          data: result,
          timestamp: Date.now(),
          ttl: cacheTTL
        })
        logger.debug("R2存储统计数据已缓存")
      }

      return result

    } catch (error) {
      logger.error("计算R2存储桶使用量失败:", error)
      const errorResult = {
        totalSize: 0,
        totalFiles: 0,
        error: error instanceof Error ? error.message : "Unknown error"
      }

      // 如果查询失败，尝试返回缓存的数据（即使过期）
      if (useCache) {
        const cached = r2StorageCache.get(cacheKey)
        if (cached) {
          logger.warn("R2查询失败，使用过期缓存数据")
          return {
            ...cached.data,
            fromCache: true,
            error: `${errorResult.error} (using cached data)`
          }
        }
      }

      return errorResult
    }
  }

  // 新增：清除R2存储统计缓存
  clearR2StorageCache(): void {
    const cacheKey = `${this.config.r2Bucket}_storage_usage`
    r2StorageCache.delete(cacheKey)
    logger.debug("R2存储统计缓存已清除")
  }

  // 新增：获取R2存储桶的详细统计信息
  async getR2StorageStats(): Promise<{
    totalSize: number
    totalFiles: number
    averageFileSize: number
    largestFile: { key: string; size: number } | null
    smallestFile: { key: string; size: number } | null
    error?: string
  }> {
    if (!this.s3Client) {
      return {
        totalSize: 0,
        totalFiles: 0,
        averageFileSize: 0,
        largestFile: null,
        smallestFile: null,
        error: "R2 client not configured"
      }
    }

    try {
      logger.debug("开始获取R2存储桶详细统计")

      let totalSize = 0
      let totalFiles = 0
      let largestFile: { key: string; size: number } | null = null
      let smallestFile: { key: string; size: number } | null = null
      let continuationToken: string | undefined

      do {
        const command = new ListObjectsV2Command({
          Bucket: this.config.r2Bucket,
          ContinuationToken: continuationToken,
          MaxKeys: 1000,
        })

        const response = await this.s3Client.send(command)

        if (response.Contents) {
          for (const object of response.Contents) {
            if (object.Size && object.Key) {
              totalSize += object.Size
              totalFiles++

              // 跟踪最大和最小文件
              if (!largestFile || object.Size > largestFile.size) {
                largestFile = { key: object.Key, size: object.Size }
              }

              if (!smallestFile || object.Size < smallestFile.size) {
                smallestFile = { key: object.Key, size: object.Size }
              }
            }
          }
        }

        continuationToken = response.NextContinuationToken

      } while (continuationToken)

      const averageFileSize = totalFiles > 0 ? Math.round(totalSize / totalFiles) : 0

      logger.info(`R2存储桶详细统计完成: ${totalFiles} 个文件，总大小: ${totalSize} 字节，平均大小: ${averageFileSize} 字节`)

      return {
        totalSize,
        totalFiles,
        averageFileSize,
        largestFile,
        smallestFile
      }

    } catch (error) {
      logger.error("获取R2存储桶详细统计失败:", error)
      return {
        totalSize: 0,
        totalFiles: 0,
        averageFileSize: 0,
        largestFile: null,
        smallestFile: null,
        error: error instanceof Error ? error.message : "Unknown error"
      }
    }
  }
}
