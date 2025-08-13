import nodemailer from 'nodemailer'

// 测试 SMTP 配置
async function testSmtpConfig() {
  try {
    console.log('开始测试 SMTP 配置...')
    
    // 从环境变量读取配置
    const config = {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '465'),
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    }
    
    console.log('SMTP 配置:', {
      host: config.host,
      port: config.port,
      user: config.auth.user,
      secure: config.secure
    })
    
    if (!config.host || !config.auth.user || !config.auth.pass) {
      console.error('❌ SMTP 配置不完整，请检查环境变量')
      return
    }
    
    const transporter = nodemailer.createTransport(config)
    
    // 验证连接
    console.log('验证 SMTP 连接...')
    await transporter.verify()
    console.log('✅ SMTP 连接验证成功')
    
    // 发送测试邮件
    const testEmail = 'test@example.com' // 替换为你的测试邮箱
    console.log(`发送测试邮件到: ${testEmail}`)
    
    const mailOptions = {
      from: {
        name: 'FireflyCloud',
        address: config.auth.user
      },
      to: testEmail,
      subject: '【FireflyCloud】SMTP 测试邮件',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2>FireflyCloud 测试邮件</h2>
          <p>这是一封测试邮件，用于验证 SMTP 配置是否正确。</p>
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <div style="font-size: 24px; font-weight: bold; color: #3b82f6;">123456</div>
            <div style="color: #666; margin-top: 8px;">测试验证码</div>
          </div>
          <p>如果您收到此邮件，说明 SMTP 配置正确。</p>
        </div>
      `,
      text: 'FireflyCloud SMTP 测试邮件。测试验证码：123456'
    }
    
    const result = await transporter.sendMail(mailOptions)
    console.log('✅ 测试邮件发送成功:', result.messageId)
    
  } catch (error) {
    console.error('❌ SMTP 测试失败:', error)
    console.error('错误详情:', {
      message: error.message,
      code: error.code,
      command: error.command
    })
  }
}

// 运行测试
testSmtpConfig()
