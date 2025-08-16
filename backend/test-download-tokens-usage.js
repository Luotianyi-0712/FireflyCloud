#!/usr/bin/env bun

/**
 * 下载令牌多次使用功能测试脚本
 * 
 * 此脚本测试下载令牌是否可以使用2次
 * 
 * 运行方式: bun run test-download-tokens-usage.js
 */

import { logger } from "./src/utils/logger.js"

const API_URL = "http://localhost:8080"

async function testDownloadTokenUsage() {
  logger.info("🧪 开始测试下载令牌多次使用功能...")

  try {
    // 这里需要有效的认证令牌和文件ID
    // 在实际测试中，您需要替换这些值
    const authToken = "your_auth_token_here"
    const fileId = "your_file_id_here"

    if (authToken === "your_auth_token_here" || fileId === "your_file_id_here") {
      logger.warn("⚠️  请在脚本中设置有效的认证令牌和文件ID")
      logger.info("💡 您可以通过以下方式获取：")
      logger.info("   1. 登录系统获取认证令牌")
      logger.info("   2. 上传一个测试文件获取文件ID")
      return
    }

    logger.info("📝 步骤1: 获取下载令牌...")
    
    // 获取下载令牌
    const tokenResponse = await fetch(`${API_URL}/files/${fileId}/download`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    if (!tokenResponse.ok) {
      const error = await tokenResponse.json().catch(() => ({}))
      throw new Error(`获取下载令牌失败: ${error.error || tokenResponse.statusText}`)
    }

    const tokenData = await tokenResponse.json()
    const downloadUrl = tokenData.downloadUrl
    logger.info(`✅ 获取下载令牌成功: ${downloadUrl}`)

    // 第一次下载
    logger.info("📝 步骤2: 第一次下载...")
    const firstDownload = await fetch(downloadUrl)
    
    if (firstDownload.ok) {
      logger.info("✅ 第一次下载成功")
    } else {
      const error = await firstDownload.json().catch(() => ({}))
      throw new Error(`第一次下载失败: ${error.error || firstDownload.statusText}`)
    }

    // 第二次下载
    logger.info("📝 步骤3: 第二次下载...")
    const secondDownload = await fetch(downloadUrl)
    
    if (secondDownload.ok) {
      logger.info("✅ 第二次下载成功")
    } else {
      const error = await secondDownload.json().catch(() => ({}))
      throw new Error(`第二次下载失败: ${error.error || secondDownload.statusText}`)
    }

    // 第三次下载（应该失败）
    logger.info("📝 步骤4: 第三次下载（应该失败）...")
    const thirdDownload = await fetch(downloadUrl)
    
    if (thirdDownload.ok) {
      logger.error("❌ 第三次下载不应该成功！")
      throw new Error("令牌使用次数限制未生效")
    } else {
      const error = await thirdDownload.json().catch(() => ({}))
      if (error.error === "Download token usage limit exceeded") {
        logger.info("✅ 第三次下载正确被拒绝：使用次数已达上限")
      } else {
        logger.warn(`⚠️  第三次下载被拒绝，但原因不符合预期: ${error.error}`)
      }
    }

    logger.info("🎉 下载令牌多次使用功能测试完成！")
    logger.info("📊 测试结果:")
    logger.info("   ✅ 第一次下载：成功")
    logger.info("   ✅ 第二次下载：成功")
    logger.info("   ✅ 第三次下载：正确被拒绝")

  } catch (error) {
    logger.error("❌ 测试失败:", error.message)
    throw error
  }
}

// 手动测试函数（需要手动提供令牌和文件ID）
async function manualTest(authToken, fileId) {
  logger.info("🧪 开始手动测试...")
  
  try {
    logger.info("📝 获取下载令牌...")
    const tokenResponse = await fetch(`${API_URL}/files/${fileId}/download`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    if (!tokenResponse.ok) {
      const error = await tokenResponse.json().catch(() => ({}))
      throw new Error(`获取下载令牌失败: ${error.error || tokenResponse.statusText}`)
    }

    const tokenData = await tokenResponse.json()
    logger.info(`✅ 下载URL: ${tokenData.downloadUrl}`)
    
    return tokenData.downloadUrl
  } catch (error) {
    logger.error("❌ 手动测试失败:", error.message)
    throw error
  }
}

// 运行测试
if (import.meta.main) {
  const args = process.argv.slice(2)
  
  if (args.length === 2) {
    // 手动测试模式
    const [authToken, fileId] = args
    manualTest(authToken, fileId)
      .then((downloadUrl) => {
        logger.info("🎉 手动测试完成")
        logger.info(`💡 您可以手动测试下载URL: ${downloadUrl}`)
        logger.info("💡 该URL应该可以使用2次，第3次会被拒绝")
        process.exit(0)
      })
      .catch((error) => {
        logger.error("💥 手动测试失败:", error)
        process.exit(1)
      })
  } else {
    // 自动测试模式
    testDownloadTokenUsage()
      .then(() => {
        logger.info("🎉 测试脚本执行完成")
        process.exit(0)
      })
      .catch((error) => {
        logger.error("💥 测试脚本执行失败:", error)
        process.exit(1)
      })
  }
}

export { testDownloadTokenUsage, manualTest }
