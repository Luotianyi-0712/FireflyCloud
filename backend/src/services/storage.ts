import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { writeFile, unlink, mkdir } from "fs/promises"
import { existsSync } from "fs"
import path from "path"

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
    if (this.config.storageType === "r2" && this.s3Client) {
      return this.uploadToR2(file, filename)
    } else {
      return this.uploadToLocal(file, filename)
    }
  }

  private async uploadToR2(file: File, filename: string): Promise<string> {
    if (!this.s3Client) throw new Error("R2 client not configured")

    const buffer = await file.arrayBuffer()

    const command = new PutObjectCommand({
      Bucket: this.config.r2Bucket,
      Key: filename,
      Body: new Uint8Array(buffer),
      ContentType: file.type,
    })

    await this.s3Client.send(command)
    return filename
  }

  private async uploadToLocal(file: File, filename: string): Promise<string> {
    const uploadsDir = path.join(process.cwd(), "uploads")

    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true })
    }

    const filePath = path.join(uploadsDir, filename)
    const buffer = await file.arrayBuffer()

    await writeFile(filePath, new Uint8Array(buffer))
    return filePath
  }

  async getDownloadUrl(storagePath: string): Promise<string> {
    if (this.config.storageType === "r2" && this.s3Client) {
      const command = new GetObjectCommand({
        Bucket: this.config.r2Bucket,
        Key: storagePath,
      })

      return await getSignedUrl(this.s3Client, command, { expiresIn: 3600 })
    } else {
      // For local storage, return a direct file serving URL
      return `/api/files/serve/${path.basename(storagePath)}`
    }
  }

  async deleteFile(storagePath: string): Promise<void> {
    if (this.config.storageType === "r2" && this.s3Client) {
      const command = new DeleteObjectCommand({
        Bucket: this.config.r2Bucket,
        Key: storagePath,
      })

      await this.s3Client.send(command)
    } else {
      await unlink(storagePath)
    }
  }
}
