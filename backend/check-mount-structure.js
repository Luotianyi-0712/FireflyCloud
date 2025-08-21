const Database = require('better-sqlite3');
const path = require('path');

// 数据库文件路径
const dbPath = path.join(__dirname, 'netdisk.db');
const db = new Database(dbPath);

try {
  console.log('=== 检查挂载点表结构 ===');
  
  // 检查OneDrive挂载点表结构
  console.log('\n--- OneDrive挂载点表结构 ---');
  const oneDriveSchema = db.prepare("PRAGMA table_info(onedrive_mount_points)").all();
  oneDriveSchema.forEach(column => {
    console.log(`${column.name}: ${column.type}`);
  });
  
  // 检查OneDrive挂载点数据
  console.log('\n--- OneDrive挂载点数据 ---');
  const onedriveMounts = db.prepare("SELECT * FROM onedrive_mount_points").all();
  onedriveMounts.forEach(mount => {
    console.log('挂载点数据:', mount);
  });
  
  // 检查R2挂载点表结构
  console.log('\n--- R2挂载点表结构 ---');
  const r2Schema = db.prepare("PRAGMA table_info(r2_mount_points)").all();
  r2Schema.forEach(column => {
    console.log(`${column.name}: ${column.type}`);
  });
  
  // 检查R2挂载点数据
  console.log('\n--- R2挂载点数据 ---');
  const r2Mounts = db.prepare("SELECT * FROM r2_mount_points").all();
  r2Mounts.forEach(mount => {
    console.log('挂载点数据:', mount);
  });
  
  // 检查WebDAV挂载点表结构
  console.log('\n--- WebDAV挂载点表结构 ---');
  try {
    const webdavSchema = db.prepare("PRAGMA table_info(webdav_mount_points)").all();
    webdavSchema.forEach(column => {
      console.log(`${column.name}: ${column.type}`);
    });
    
    // 检查WebDAV挂载点数据
    console.log('\n--- WebDAV挂载点数据 ---');
    const webdavMounts = db.prepare("SELECT * FROM webdav_mount_points").all();
    webdavMounts.forEach(mount => {
      console.log('挂载点数据:', mount);
    });
  } catch (error) {
    console.log('WebDAV挂载点表不存在');
  }
  
} catch (error) {
  console.error('检查失败:', error);
} finally {
  db.close();
}