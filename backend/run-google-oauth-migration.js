import Database from 'bun:sqlite';
import { readFileSync } from 'fs';

const db = new Database('./netdisk.db');

try {
  console.log('开始执行谷歌OAuth配置迁移...');
  
  const migration = readFileSync('./migrations/add-google-oauth.sql', 'utf8');
  db.exec(migration);
  
  console.log('谷歌OAuth配置迁移完成！');
  
  // 验证表是否创建成功
  const result = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='google_oauth_config'").get();
  if (result) {
    console.log('✓ google_oauth_config 表创建成功');
    
    // 检查默认配置
    const config = db.query("SELECT * FROM google_oauth_config WHERE id = 1").get();
    console.log('默认配置:', config);
  } else {
    console.log('✗ google_oauth_config 表创建失败');
  }
} catch (error) {
  console.error('迁移失败:', error);
} finally {
  db.close();
}