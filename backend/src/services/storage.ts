import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { writeFile, unlink, mkdir } from "fs/promises"
import { existsSync } from "fs"
import path from "path"
import { logger } from "../utils/logger"

export class StorageService {
  private s3Client?: S3Client
  private config: any

  constructor(config: any) {
    this.config = config

    if (config.storageType === "r2" && config.r2Endpoint) {
      this.s3Client = new S3Client({
        region: "auto",
        endpoint: config.r2Endpoint,
        credentials: {
          accessKeyId: config.r2AccessKey,
          secretAccessKey: config.r2SecretKey,
        },
      })
    }
  }

  async uploadFile(file: File, filename: string): Promise<string> {
    logger.debug(`开始上传文件: ${filename} 到 ${this.config.storageType} 存储`)

    if (this.config.storageType === "r2" && this.s3Client) {
      return this.uploadToR2(file, filename)
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
    } else {
      await unlink(storagePath)
      logger.info(`文件从本地删除成功: ${storagePath}`)
    }
  }
}
