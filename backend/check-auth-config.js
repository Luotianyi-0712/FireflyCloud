const Database = require('better-sqlite3');
const path = require('path');

// 数据库文件路径
const dbPath = path.join(__dirname, 'netdisk.db');
const db = new Database(dbPath);

try {
  console.log('=== 检查认证和配置信息 ===');
  
  // 检查OneDrive认证表
  console.log('\n--- OneDrive认证表结构 ---');
  try {
    const oneDriveAuthSchema = db.prepare("PRAGMA table_info(onedrive_auth)").all();
    oneDriveAuthSchema.forEach(column => {
      console.log(`${column.name}: ${column.type}`);
    });
    
    console.log('\n--- OneDrive认证数据 ---');
    const oneDriveAuth = db.prepare("SELECT * FROM onedrive_auth").all();
    oneDriveAuth.forEach(auth => {
      console.log('认证数据:', {
        ...auth,
        access_token: auth.access_token ? '***' : null,
        refresh_token: auth.refresh_token ? '***' : null
      });
    });
  } catch (error) {
    console.log('OneDrive认证表不存在或查询失败');
  }
  
  // 检查存储配置表的详细信息
  console.log('\n--- 存储配置表详细信息 ---');
  const storageConfigSchema = db.prepare("PRAGMA table_info(storage_config)").all();
  storageConfigSchema.forEach(column => {
    console.log(`${column.name}: ${column.type}`);
  });
  
  console.log('\n--- 存储配置数据 ---');
  const storageConfig = db.prepare("SELECT * FROM storage_config").all();
  storageConfig.forEach(config => {
    console.log('配置数据:', {
      ...config,
      r2_secret_key: config.r2_secret_key ? '***' : config.r2_secret_key,
      onedrive_client_secret: config.onedrive_client_secret ? '***' : config.onedrive_client_secret,
      onedrive_webdav_pass: config.onedrive_webdav_pass ? '***' : config.onedrive_webdav_pass
    });
  });
  
  // 检查所有表
  console.log('\n--- 数据库中的所有表 ---');
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  tables.forEach(table => {
    console.log(`- ${table.name}`);
  });
  
} catch (error) {
  console.error('检查失败:', error);
} finally {
  db.close();
}