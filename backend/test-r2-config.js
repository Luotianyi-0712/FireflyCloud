/**
 * R2配置测试脚本
 * 用于验证Cloudflare R2配置是否正确
 */

import { S3Client, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3"
import { db } from "./src/db/index.js"
import { storageConfig } from "./src/db/schema.js"

async function testR2Configuration() {
  console.log("🔍 开始测试R2配置...")

  try {
    // 1. 从数据库获取R2配置
    console.log("📊 从数据库获取R2配置...")
    const config = await db.select().from(storageConfig).get()
    
    if (!config) {
      console.error("❌ 未找到存储配置")
      return
    }

    console.log("✅ 存储配置:")
    console.log(`   存储类型: ${config.storageType}`)
    console.log(`   R2端点: ${config.r2Endpoint || '未配置'}`)
    console.log(`   R2存储桶: ${config.r2Bucket || '未配置'}`)
    console.log(`   混合模式: ${config.enableMixedMode ? '启用' : '禁用'}`)

    // 2. 检查R2配置完整性
    if (!config.r2Endpoint || !config.r2AccessKey || !config.r2SecretKey || !config.r2Bucket) {
      console.error("❌ R2配置不完整，请检查以下配置:")
      console.error(`   - R2端点: ${config.r2Endpoint ? '✅' : '❌ 未配置'}`)
      console.error(`   - Access Key: ${config.r2AccessKey ? '✅' : '❌ 未配置'}`)
      console.error(`   - Secret Key: ${config.r2SecretKey ? '✅' : '❌ 未配置'}`)
      console.error(`   - 存储桶: ${config.r2Bucket ? '✅' : '❌ 未配置'}`)
      return
    }

    // 3. 创建S3客户端
    console.log("🔧 创建R2客户端...")
    const s3Client = new S3Client({
      region: "auto",
      endpoint: config.r2Endpoint,
      credentials: {
        accessKeyId: config.r2AccessKey,
        secretAccessKey: config.r2SecretKey,
      },
      forcePathStyle: true,
    })

    // 4. 测试连接 - 列出存储桶内容
    console.log("🔗 测试R2连接...")
    try {
      const listCommand = new ListObjectsV2Command({
        Bucket: config.r2Bucket,
        MaxKeys: 5, // 只获取前5个对象
      })

      const listResult = await s3Client.send(listCommand)
      console.log("✅ R2连接成功!")
      console.log(`   存储桶中的对象数量: ${listResult.KeyCount || 0}`)
      
      if (listResult.Contents && listResult.Contents.length > 0) {
        console.log("   最近的文件:")
        listResult.Contents.slice(0, 3).forEach((obj, index) => {
          console.log(`   ${index + 1}. ${obj.Key} (${obj.Size} bytes)`)
        })
      }
    } catch (error) {
      console.error("❌ R2连接失败:")
      console.error(`   错误类型: ${error.name}`)
      console.error(`   错误信息: ${error.message}`)
      
      if (error.name === 'SignatureDoesNotMatch') {
        console.error("🔧 签名不匹配错误，请检查:")
        console.error("   1. Access Key 和 Secret Key 是否正确")
        console.error("   2. R2端点URL是否正确")
        console.error("   3. 存储桶名称是否正确")
      } else if (error.name === 'NoSuchBucket') {
        console.error("🔧 存储桶不存在，请检查存储桶名称")
      } else if (error.name === 'AccessDenied') {
        console.error("🔧 访问被拒绝，请检查API令牌权限")
      }
      return
    }

    // 5. 测试上传 - 上传一个小的测试文件
    console.log("📤 测试文件上传...")
    try {
      const testContent = `R2配置测试文件\n创建时间: ${new Date().toISOString()}`
      const testKey = `test/config-test-${Date.now()}.txt`

      const putCommand = new PutObjectCommand({
        Bucket: config.r2Bucket,
        Key: testKey,
        Body: Buffer.from(testContent, 'utf-8'),
        ContentType: 'text/plain',
      })

      await s3Client.send(putCommand)
      console.log("✅ 文件上传成功!")
      console.log(`   测试文件: ${testKey}`)
      console.log("   注意: 这是一个测试文件，可以安全删除")
    } catch (error) {
      console.error("❌ 文件上传失败:")
      console.error(`   错误信息: ${error.message}`)
    }

    console.log("\n🎉 R2配置测试完成!")
    console.log("如果看到上述所有✅标记，说明R2配置正确")

  } catch (error) {
    console.error("❌ 测试过程中发生错误:", error)
  }
}

// 运行测试
testR2Configuration().catch(console.error)
