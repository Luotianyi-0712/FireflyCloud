const Database = require('better-sqlite3');
const path = require('path');

// 数据库文件路径
const dbPath = path.join(__dirname, 'netdisk.db');
const db = new Database(dbPath);

try {
  console.log('=== 检查现有存储配置 ===');
  
  // 检查存储配置表
  const storageConfig = db.prepare("SELECT * FROM storage_config").get();
  console.log('当前存储配置:', JSON.stringify(storageConfig, null, 2));
  
  console.log('\n=== 检查存储策略表 ===');
  
  // 检查存储策略表
  const strategies = db.prepare("SELECT * FROM storage_strategies").all();
  console.log('当前存储策略数量:', strategies.length);
  strategies.forEach(strategy => {
    console.log(`策略: ${strategy.name} (${strategy.type}) - 激活: ${strategy.is_active}`);
    console.log(`配置: ${strategy.config}`);
  });
  
  console.log('\n=== 检查挂载点 ===');
  
  // 检查OneDrive挂载点
  const onedriveMounts = db.prepare("SELECT * FROM onedrive_mount_points").all();
  console.log('OneDrive挂载点数量:', onedriveMounts.length);
  
  // 检查WebDAV挂载点
  const webdavMounts = db.prepare("SELECT * FROM webdav_mount_points").all();
  console.log('WebDAV挂载点数量:', webdavMounts.length);
  
  // 检查R2挂载点
  const r2Mounts = db.prepare("SELECT * FROM r2_mount_points").all();
  console.log('R2挂载点数量:', r2Mounts.length);

} catch (error) {
  console.error('检查失败:', error);
} finally {
  db.close();
}