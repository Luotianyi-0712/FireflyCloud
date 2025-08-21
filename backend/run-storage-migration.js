const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// 数据库文件路径
const dbPath = path.join(__dirname, 'netdisk.db');

// 检查数据库文件是否存在
if (!fs.existsSync(dbPath)) {
  console.error('数据库文件不存在:', dbPath);
  process.exit(1);
}

// 连接数据库
const db = new Database(dbPath);

try {
  // 读取迁移文件
  const migrationPath = path.join(__dirname, 'migrations', 'add-storage-strategies.sql');
  const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

  console.log('开始执行存储策略表迁移...');

  // 执行迁移
  const statements = migrationSQL.split(';').filter(stmt => stmt.trim());
  
  db.transaction(() => {
    for (const statement of statements) {
      if (statement.trim()) {
        db.exec(statement);
      }
    }
  })();

  console.log('存储策略表迁移完成！');

  // 验证表是否创建成功
  const tableInfo = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='storage_strategies'").get();
  if (tableInfo) {
    console.log('✅ storage_strategies 表创建成功');
    
    // 检查默认策略是否插入
    const defaultStrategy = db.prepare("SELECT * FROM storage_strategies WHERE id = 'default-local'").get();
    if (defaultStrategy) {
      console.log('✅ 默认本地存储策略已创建');
    }
  } else {
    console.log('❌ storage_strategies 表创建失败');
  }

} catch (error) {
  console.error('迁移执行失败:', error);
  process.exit(1);
} finally {
  db.close();
}