import nodemailer from 'nodemailer'
import { nanoid } from 'nanoid'
import { db } from '../db'
import { smtpConfig } from '../db/schema'

// 检查必要的环境变量（作为后备配置）
function validateEmailConfig() {
  const requiredEnvVars = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS']
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName])

  if (missingVars.length > 0) {
    console.warn('⚠️ 环境变量中缺少 SMTP 配置，将使用数据库配置')
    console.warn('缺少的环境变量:', missingVars.join(', '))
  } else {
    console.log('✅ 环境变量 SMTP 配置检查通过')
  }
}

// 验证环境变量
validateEmailConfig()

// 获取 SMTP 配置
async function getSmtpConfig() {
  try {
    // 首先尝试从数据库获取配置
    const config = await db.select().from(smtpConfig).get()

    if (config && config.enabled) {
      return {
        host: config.host!,
        port: config.port!,
        secure: config.secure,
        auth: {
          user: config.user!,
          pass: config.pass!
        },
        emailTemplate: config.emailTemplate
      }
    }

    // 如果数据库中没有启用的配置，使用环境变量
    if (process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS) {
      return {
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT),
        secure: true,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        },
        emailTemplate: null
      }
    }

    throw new Error('No SMTP configuration available')
  } catch (error) {
    console.error('Failed to get SMTP config:', error)
    throw error
  }
}

// 生成6位数验证码
export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

// 邮件HTML模板
function getEmailTemplate(code: string, email: string): string {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FireflyCloud 邮箱验证</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            background-color: #ffffff;
            border-radius: 12px;
            padding: 40px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
        }
        .logo {
            width: 60px;
            height: 60px;
            background: linear-gradient(135deg, #3b82f6, #8b5cf6);
            border-radius: 12px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 20px;
        }
        .logo svg {
            width: 30px;
            height: 30px;
            color: white;
        }
        .title {
            color: #1f2937;
            font-size: 28px;
            font-weight: bold;
            margin: 0;
        }
        .subtitle {
            color: #6b7280;
            font-size: 16px;
            margin: 8px 0 0 0;
        }
        .content {
            margin: 30px 0;
        }
        .greeting {
            font-size: 18px;
            color: #374151;
            margin-bottom: 20px;
        }
        .code-container {
            background: linear-gradient(135deg, #f3f4f6, #e5e7eb);
            border-radius: 12px;
            padding: 30px;
            text-align: center;
            margin: 30px 0;
            border: 2px dashed #d1d5db;
        }
        .code {
            font-size: 36px;
            font-weight: bold;
            color: #3b82f6;
            letter-spacing: 8px;
            font-family: 'Courier New', monospace;
        }
        .code-label {
            color: #6b7280;
            font-size: 14px;
            margin-top: 10px;
        }
        .warning {
            background-color: #fef3c7;
            border: 1px solid #f59e0b;
            border-radius: 8px;
            padding: 16px;
            margin: 20px 0;
        }
        .warning-text {
            color: #92400e;
            font-size: 14px;
            margin: 0;
        }
        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            text-align: center;
            color: #6b7280;
            font-size: 14px;
        }
        .footer a {
            color: #3b82f6;
            text-decoration: none;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9V7L15 1H5C3.89 1 3 1.89 3 3V19C3 20.1 3.9 21 5 21H11V19H5V3H13V9H21Z"/>
                </svg>
            </div>
            <h1 class="title">FireflyCloud</h1>
            <p class="subtitle">现代化云存储解决方案</p>
        </div>
        
        <div class="content">
            <p class="greeting">您好！</p>
            <p>感谢您注册 FireflyCloud 账户。为了确保您的邮箱地址有效，请使用以下验证码完成注册：</p>
            
            <div class="code-container">
                <div class="code">${code}</div>
                <div class="code-label">邮箱验证码</div>
            </div>
            
            <p>请在注册页面输入此验证码以完成账户创建。</p>
            
            <div class="warning">
                <p class="warning-text">
                    <strong>重要提示：</strong>
                    <br>• 此验证码将在 10 分钟后过期
                    <br>• 请勿将验证码分享给他人
                    <br>• 如果您没有注册 FireflyCloud 账户，请忽略此邮件
                </p>
            </div>
        </div>
        
        <div class="footer">
            <p>此邮件由 FireflyCloud 系统自动发送，请勿回复。</p>
            <p>如有疑问，请访问 <a href="#">帮助中心</a> 或联系客服。</p>
            <p style="margin-top: 20px; color: #9ca3af;">
                © 2024 FireflyCloud. 保留所有权利。
            </p>
        </div>
    </div>
</body>
</html>
  `
}

// 发送验证码邮件
export async function sendVerificationEmail(email: string, code: string): Promise<boolean> {
  try {
    const config = await getSmtpConfig()

    const nodemailer = await import('nodemailer')
    const transporter = nodemailer.default.createTransport(config)

    // 使用自定义模板或默认模板
    const template = config.emailTemplate || getEmailTemplate(code, email)

    const mailOptions = {
      from: {
        name: 'FireflyCloud',
        address: config.auth.user
      },
      to: email,
      subject: '【FireflyCloud】邮箱验证码',
      html: template.replace(/\{\{CODE\}\}/g, code),
      text: `您的 FireflyCloud 邮箱验证码是：${code}，有效期10分钟。请勿将验证码分享给他人。`
    }

    const result = await transporter.sendMail(mailOptions)
    console.log('邮件发送成功:', result.messageId)
    return true
  } catch (error) {
    console.error('邮件发送失败:', error)
    return false
  }
}

// 验证邮件配置
export async function verifyEmailConfig(): Promise<boolean> {
  try {
    const config = await getSmtpConfig()
    const nodemailer = await import('nodemailer')
    const transporter = nodemailer.default.createTransport(config)

    await transporter.verify()
    console.log('邮件服务配置正确')
    return true
  } catch (error) {
    console.error('邮件服务配置错误:', error)
    return false
  }
}
