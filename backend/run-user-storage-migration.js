const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'netdisk.db');
const migrationPath = path.join(__dirname, 'migrations', 'add-user-storage-assignments.sql');

console.log('🔧 开始执行用户存储策略分配迁移...');

try {
  // 检查数据库文件是否存在
  if (!fs.existsSync(dbPath)) {
    console.error('❌ 数据库文件不存在:', dbPath);
    process.exit(1);
  }

  // 检查迁移文件是否存在
  if (!fs.existsSync(migrationPath)) {
    console.error('❌ 迁移文件不存在:', migrationPath);
    process.exit(1);
  }

  // 连接数据库
  const db = new Database(dbPath);
  
  // 读取迁移SQL
  const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
  
  // 分割SQL语句并执行
  const statements = migrationSQL
    .split(';')
    .map(stmt => stmt.trim())
    .filter(stmt => stmt.length > 0);

  console.log(`📝 准备执行 ${statements.length} 条SQL语句...`);

  // 开始事务
  const transaction = db.transaction(() => {
    statements.forEach((statement, index) => {
      try {
        console.log(`执行语句 ${index + 1}/${statements.length}...`);
        db.exec(statement);
      } catch (error) {
        console.error(`❌ 执行语句 ${index + 1} 失败:`, error.message);
        console.error('语句内容:', statement);
        throw error;
      }
    });
  });

  // 执行事务
  transaction();

  // 验证表是否创建成功
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('user_storage_assignments', 'role_storage_defaults')").all();
  
  console.log('✅ 迁移执行成功！');
  console.log('📊 创建的表:', tables.map(t => t.name).join(', '));

  // 关闭数据库连接
  db.close();
  
  console.log('🎉 用户存储策略分配迁移完成！');

} catch (error) {
  console.error('❌ 迁移执行失败:', error);
  process.exit(1);
}